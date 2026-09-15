(function() {
  'use strict';

  const WIDGET_URL = 'https://medica-app.vercel.app/widget';
  const BUTTON_SIZE = 60;
  const CHAT_WIDTH = 380;
  const CHAT_HEIGHT = 600;

  let widgetContainer = null;
  let chatFrame = null;
  let isOpen = false;

  function createWidget() {
    if (widgetContainer) return;

    widgetContainer = document.createElement('div');
    widgetContainer.id = 'medica-chat-widget';
    widgetContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const button = document.createElement('button');
    button.id = 'medica-chat-button';
    button.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    button.style.cssText = `
      width: ${BUTTON_SIZE}px;
      height: ${BUTTON_SIZE}px;
      border-radius: 50%;
      background: #2563eb;
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    button.addEventListener('mouseenter', function() {
      this.style.transform = 'scale(1.05)';
      this.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
    });
    button.addEventListener('mouseleave', function() {
      this.style.transform = 'scale(1)';
      this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    });
    button.addEventListener('click', toggleChat);

    const chatWindow = document.createElement('div');
    chatWindow.id = 'medica-chat-window';
    chatWindow.style.cssText = `
      position: absolute;
      bottom: ${BUTTON_SIZE + 16}px;
      right: 0;
      width: ${CHAT_WIDTH}px;
      height: ${CHAT_HEIGHT}px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      overflow: hidden;
      display: none;
      flex-direction: column;
    `;

    const iframe = document.createElement('iframe');
    iframe.src = WIDGET_URL;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
    `;
    iframe.setAttribute('allow', 'microphone');

    chatWindow.appendChild(iframe);
    chatFrame = chatWindow;

    widgetContainer.appendChild(chatWindow);
    widgetContainer.appendChild(button);
    document.body.appendChild(widgetContainer);
  }

  function toggleChat() {
    if (!chatFrame) return;

    isOpen = !isOpen;
    chatFrame.style.display = isOpen ? 'flex' : 'none';

    const button = document.getElementById('medica-chat-button');
    if (button) {
      button.innerHTML = isOpen ? `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      ` : `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
    }
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createWidget);
    } else {
      createWidget();
    }
  }

  window.MedicaChat = {
    open: function() {
      if (!isOpen) toggleChat();
    },
    close: function() {
      if (isOpen) toggleChat();
    },
    toggle: toggleChat,
  };

  init();
})();
