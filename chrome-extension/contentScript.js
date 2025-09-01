// MAI HUD SHELL START
//
// This content script injects a simple overlay (HUD) onto Sunfire pages.  The
// HUD floats over the existing UI, providing a container for future
// compliance tools, rebuttal suggestions, and drug lookup features.  For
// this initial patch, the HUD only exposes a shell: a header with
// branding, three tabs for Checklist, Rebuttals, and Drugs, and a body
// area containing placeholder content.  The panel is draggable,
// resizable, collapsible, and remembers its position and size via
// localStorage.  No Sunfire DOM is modified; we rely on a Shadow DOM
// root to keep styles isolated.

(() => {
  // Prevent double injection if the content script runs multiple times.
  if (window.__maiHudInjected) return;
  window.__maiHudInjected = true;

  // A reference to the host container.  When toggling the HUD on and off,
  // we remove this element from the DOM to unmount the HUD and set it
  // back to null so it can be mounted again.
  let HOST_CONTAINER = null;

  // Local storage helpers.  We wrap get/set calls in try/catch in case
  // access is denied (e.g., in incognito mode).
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (err) { /* no-op */ }
  }
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    } catch (err) {
      return fallback;
    }
  }

  /**
   * Injects the HUD into the current page.  We create a host div,
   * attach a shadow root, and then build the HUD structure inside
   * the shadow.  Event handlers for dragging, resizing, collapsing,
   * and closing are bound here.  Persisted layout values are applied
   * from localStorage.
   */
  function mountHud() {
    // Create a host element with high z-index so the HUD stays above all
    // other content.  Use initial CSS to avoid inheriting page styles.
    const host = document.createElement('div');

    // Store a reference so we can remove this host element on toggle.  Without
    // keeping this reference, unmountHud() cannot remove the correct element.
    HOST_CONTAINER = host;
    host.style.all = 'initial';
    host.style.zIndex = '2147483647';
    document.documentElement.appendChild(host);

    // Attach a shadow root for style isolation.  Use open mode so we
    // can introspect elements from within our script if needed.
    const shadow = host.attachShadow({ mode: 'open' });

    // Load the HUD stylesheet.  We cannot use external URLs in MV3
    // content scripts, so we resolve the path via chrome.runtime.getURL().
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('hud.css');
    shadow.appendChild(link);

    // Create the wrapper for the HUD.  Apply stored layout values or
    // sensible defaults.  We maintain separate left/right anchors to
    // support docking the panel on either side of the viewport.
    const wrapper = document.createElement('div');
    wrapper.className = 'maihud';
    wrapper.style.top = load('mai_top', '80px');
    const left = load('mai_left', '');
    const right = load('mai_right', '20px');
    if (left) {
      wrapper.style.left = left;
      wrapper.style.right = '';
    } else {
      wrapper.style.right = right;
      wrapper.style.left = '';
    }
    wrapper.style.width = load('mai_width', '360px');
    wrapper.style.height = load('mai_height', '540px');
    shadow.appendChild(wrapper);

    // Build the HUD content.  We keep the HTML inline for simplicity and
    // update it via rendering logic in future patches.  The header
    // provides drag handle and collapse/close buttons.  Tabs switch
    // between placeholder views.  A resizer handle allows resizing.
    wrapper.innerHTML = `
      <div class="maihud-header" id="maiDragHandle" title="Drag to move">
        <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="MAI">
        <div class="maihud-title">Powered by MAI — Medicare Advantage AI</div>
        <div class="maihud-controls">
          <button class="maihud-btn" id="maiCollapseBtn">▾</button>
          <button class="maihud-btn" id="maiCloseBtn">✕</button>
        </div>
      </div>
      <div class="maihud-tabs">
        <button class="maihud-tab active" data-tab="checklist">Checklist</button>
        <button class="maihud-tab" data-tab="rebuttals">Rebuttals</button>
        <button class="maihud-tab" data-tab="drugs">Drugs</button>
      </div>
      <div class="maihud-body">
        <div data-view="checklist" class="placeholder">Checklist will appear here in a future update.</div>
        <div data-view="rebuttals" class="placeholder" style="display:none">Rebuttals UI will be added in a future update.</div>
        <div data-view="drugs" class="placeholder" style="display:none">Drug lookup will be implemented in a future update.</div>
      </div>
      <div class="resizer" id="maiResizer"></div>
    `;

    // Tab switching: toggle active class and show/hide corresponding view.
    const tabs = Array.from(wrapper.querySelectorAll('.maihud-tab'));
    const views = {
      checklist: wrapper.querySelector('[data-view="checklist"]'),
      rebuttals: wrapper.querySelector('[data-view="rebuttals"]'),
      drugs: wrapper.querySelector('[data-view="drugs"]')
    };
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const key = tab.dataset.tab;
        Object.keys(views).forEach(k => {
          views[k].style.display = (k === key) ? '' : 'none';
        });
      });
    });

    // Collapse/expand the body.  When collapsed, hide tabs and body.
    const collapseBtn = wrapper.querySelector('#maiCollapseBtn');
    collapseBtn.addEventListener('click', () => {
      wrapper.classList.toggle('collapsed');
      collapseBtn.textContent = wrapper.classList.contains('collapsed') ? '▸' : '▾';
    });

    // Close the HUD: remove host element and mark as unmounted so it can
    // be re-injected if necessary (e.g., on SPA route changes).
    wrapper.querySelector('#maiCloseBtn').addEventListener('click', () => {
      host.remove();
      window.__maiHudInjected = false;
    });

    // Drag functionality.  Store the starting mouse position and HUD
    // offset, then update on mousemove.  Persist the final position on
    // mouseup.  If the HUD is anchored on the right, update the right
    // property instead of left.
    const dragHandle = wrapper.querySelector('#maiDragHandle');
    let dragData = null;
    dragHandle.addEventListener('mousedown', (e) => {
      dragData = {
        startX: e.clientX,
        startY: e.clientY,
        origTop: wrapper.offsetTop,
        origLeft: wrapper.offsetLeft,
        anchoredRight: !!wrapper.style.right && wrapper.style.right !== ''
      };
      e.preventDefault();
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onStopDrag);
    });
    function onDrag(e) {
      if (!dragData) return;
      const deltaX = e.clientX - dragData.startX;
      const deltaY = e.clientY - dragData.startY;
      wrapper.style.top = (dragData.origTop + deltaY) + 'px';
      if (dragData.anchoredRight) {
        // For right anchoring, compute new right offset by subtracting the
        // horizontal delta from the original right offset.
        const origRight = parseInt(wrapper.style.right || '20', 10);
        wrapper.style.right = (origRight - deltaX) + 'px';
      } else {
        wrapper.style.left = (dragData.origLeft + deltaX) + 'px';
      }
    }
    function onStopDrag() {
      // Persist the final top/left/right positions.
      save('mai_top', wrapper.style.top);
      if (dragData) {
        if (dragData.anchoredRight) {
          save('mai_right', wrapper.style.right);
          save('mai_left', '');
        } else {
          save('mai_left', wrapper.style.left);
          save('mai_right', '');
        }
      }
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onStopDrag);
      dragData = null;
    }

    // Resizer: allow the user to change the HUD's width and height.  Track
    // initial pointer position and current dimensions, then update on
    // mousemove.  Persist final dimensions on mouseup.
    const resizer = wrapper.querySelector('#maiResizer');
    let resizeData = null;
    resizer.addEventListener('mousedown', (e) => {
      resizeData = {
        startX: e.clientX,
        startY: e.clientY,
        origWidth: wrapper.offsetWidth,
        origHeight: wrapper.offsetHeight
      };
      e.preventDefault();
      document.addEventListener('mousemove', onResize);
      document.addEventListener('mouseup', onStopResize);
    });
    function onResize(e) {
      if (!resizeData) return;
      const deltaX = e.clientX - resizeData.startX;
      const deltaY = e.clientY - resizeData.startY;
      // Set minimum dimensions to prevent the HUD from becoming unusably small.
      const newWidth = Math.max(300, resizeData.origWidth + deltaX);
      const newHeight = Math.max(300, resizeData.origHeight + deltaY);
      wrapper.style.width = newWidth + 'px';
      wrapper.style.height = newHeight + 'px';
    }
    function onStopResize() {
      save('mai_width', wrapper.style.width);
      save('mai_height', wrapper.style.height);
      document.removeEventListener('mousemove', onResize);
      document.removeEventListener('mouseup', onStopResize);
      resizeData = null;
    }
  }

  // ---------------------------------------------------------------------------
  // HUD toggling support
  //
  // Unlike the original implementation, the HUD should not automatically
  // mount when the page loads.  Instead, it is toggled on and off when
  // the user clicks the extension's toolbar button.  To support this,
  // we expose an unmount function and listen for a message from the
  // background service worker.  When a toggle message is received, we
  // either mount or unmount the HUD based on whether it is currently
  // injected.

  /**
   * Removes the HUD from the page if it is present.  Clears the
   * host reference and resets the injection flag so the HUD can be
   * mounted again.  This does nothing if the HUD is not mounted.
   */
  function unmountHud() {
    try {
      if (HOST_CONTAINER) {
        HOST_CONTAINER.remove();
        HOST_CONTAINER = null;
      }
      // Reset the injected flag so mountHud() can run again.
      window.__maiHudInjected = false;
    } catch (err) {
      console.warn('[MAI] Failed to unmount HUD:', err);
    }
  }

  // Listen for messages from the background service worker.  When the
  // toolbar icon is clicked, the background script sends a
  // MAI_TOGGLE_HUD message.  We toggle the HUD accordingly.
  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (!msg || msg.type !== 'MAI_TOGGLE_HUD') return;
    try {
      if (window.__maiHudInjected) {
        unmountHud();
      } else {
        mountHud();
      }
    } catch (err) {
      console.warn('[MAI] Error toggling HUD:', err);
    }
  });
})();
// MAI HUD SHELL END