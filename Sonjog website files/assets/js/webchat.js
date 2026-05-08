/**
 * SaaS Site WebChat Widget
 *
 * Embeddable chat widget for websites.
 * Usage:
 *   <script>
 *     (function(w,d,s,o,f,js,fjs){
 *       w['WebChatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
 *       js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
 *       js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
 *     })(window,document,'script','webchat','https://your-domain.com/widget/webchat.js');
 *     webchat('init', { widgetKey: 'YOUR_WIDGET_KEY' });
 *   </script>
 */

(function (window, document) {
  "use strict";

  // Configuration
  const API_BASE_URL = window.WEBCHAT_API_URL || "";
  const WS_BASE_URL = window.WEBCHAT_WS_URL || "";

  // State
  let config = null;
  let widgetKey = null;
  let sessionKey = null;
  let websocket = null;
  let isOpen = false;
  let isConnected = false;
  let messages = [];
  let visitorInfo = null;
  let elements = {};
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  let selectedFile = null;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // Command queue processing
  const commandQueue = window.webchat?.q || [];

  // Initialize the widget
  function init(options) {
    if (!options || !options.widgetKey) {
      console.error("WebChat: widgetKey is required");
      return;
    }

    widgetKey = options.widgetKey;

    // Fetch widget configuration
    fetchConfig().then(() => {
      if (config) {
        createWidget();
        setupEventListeners();

        // Auto-open if configured
        if (config.auto_open) {
          setTimeout(
            () => {
              openWidget();
            },
            (config.auto_open_delay || 5) * 1000,
          );
        }
      }
    });
  }

  // Fetch widget configuration from API
  async function fetchConfig() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/webchat/public/config/${widgetKey}/`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch widget config");
      }
      config = await response.json();
    } catch (error) {
      console.error("WebChat: Failed to load widget configuration", error);
    }
  }

  // Create widget DOM elements
  function createWidget() {
    // Create container
    const container = document.createElement("div");
    container.id = "webchat-widget-container";
    container.innerHTML = getWidgetHTML();
    document.body.appendChild(container);

    // Cache element references
    elements = {
      container,
      launcher: document.getElementById("webchat-launcher"),
      window: document.getElementById("webchat-window"),
      closeBtn: document.getElementById("webchat-close"),
      minimizeBtn: document.getElementById("webchat-minimize"),
      form: document.getElementById("webchat-prechat-form"),
      chatArea: document.getElementById("webchat-chat-area"),
      messagesContainer: document.getElementById("webchat-messages"),
      inputContainer: document.getElementById("webchat-input-container"),
      messageInput: document.getElementById("webchat-message-input"),
      sendBtn: document.getElementById("webchat-send-btn"),
      fileInput: document.getElementById("webchat-file-input"),
      attachBtn: document.getElementById("webchat-attach-btn"),
      filePreview: document.getElementById("webchat-file-preview"),
    };

    // Apply styles
    applyStyles();
  }

  // Generate widget HTML
  function getWidgetHTML() {
    const position = getPositionStyles();

    return `
      <!-- Launcher Button -->
      <button id="webchat-launcher" class="webchat-launcher" style="${
        position.launcher
      }">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      
      <!-- Chat Window -->
      <div id="webchat-window" class="webchat-window webchat-hidden" style="${
        position.window
      }">
        <!-- Header -->
        <div id="webchat-header" class="webchat-header">
          <div class="webchat-header-content">
            ${
              config.logo
                ? `<img src="${config.logo}" alt="Logo" class="webchat-logo" />`
                : ""
            }
            <div class="webchat-header-text">
              <h3 class="webchat-title">${escapeHtml(
                config.header_title || "Chat with us",
              )}</h3>
              ${
                config.header_subtitle
                  ? `<p class="webchat-subtitle">${escapeHtml(
                      config.header_subtitle,
                    )}</p>`
                  : ""
              }
            </div>
          </div>
          <div class="webchat-header-actions">
            <button id="webchat-minimize" class="webchat-header-btn" title="Minimize">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button id="webchat-close" class="webchat-header-btn" title="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Pre-chat Form -->
        <form id="webchat-prechat-form" class="webchat-prechat-form">
          <p class="webchat-form-intro">Please fill in your details to start chatting</p>
          ${
            config.require_name
              ? `
            <div class="webchat-form-field">
              <label for="webchat-name">Name *</label>
              <input type="text" id="webchat-name" name="name" required placeholder="Your name" />
            </div>
          `
              : ""
          }
          ${
            config.require_email
              ? `
            <div class="webchat-form-field">
              <label for="webchat-email">Email *</label>
              <input type="email" id="webchat-email" name="email" required placeholder="your@email.com" />
            </div>
          `
              : ""
          }
          ${
            config.require_phone
              ? `
            <div class="webchat-form-field">
              <label for="webchat-phone">Phone *</label>
              <input type="tel" id="webchat-phone" name="phone" required placeholder="01XXXXXXXXX" />
            </div>
          `
              : ""
          }
          <button type="submit" class="webchat-submit-btn">Start Chat</button>
        </form>
        
        <!-- Chat Area (hidden initially) -->
        <div id="webchat-chat-area" class="webchat-chat-area webchat-hidden">
          <div id="webchat-messages" class="webchat-messages">
            <!-- Messages will be inserted here -->
          </div>
          <!-- File Preview Area -->
          <div id="webchat-file-preview" class="webchat-file-preview webchat-hidden">
            <!-- File preview will be inserted here -->
          </div>
          <div id="webchat-input-container" class="webchat-input-container">
            <input 
              type="file" 
              id="webchat-file-input" 
              accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
              style="display: none;"
            />
            <button id="webchat-attach-btn" class="webchat-attach-btn" title="Attach file">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>
            <input 
              type="text" 
              id="webchat-message-input" 
              placeholder="${escapeHtml(
                config.placeholder_text || "Type your message...",
              )}"
              autocomplete="off"
            />
            <button id="webchat-send-btn" class="webchat-send-btn" title="Send">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Powered By -->
        ${
          config.show_powered_by
            ? `
          <div class="webchat-powered-by">
            Powered by ${config.powered_by_text}
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  // Get position styles based on config
  function getPositionStyles() {
    const pos = config.position || "bottom-right";
    const margin = "20px";

    const positions = {
      "bottom-right": {
        launcher: `bottom: ${margin}; right: ${margin};`,
        window: `bottom: 80px; right: ${margin};`,
      },
      "bottom-left": {
        launcher: `bottom: ${margin}; left: ${margin};`,
        window: `bottom: 80px; left: ${margin};`,
      },
      "top-right": {
        launcher: `top: ${margin}; right: ${margin};`,
        window: `top: 80px; right: ${margin};`,
      },
      "top-left": {
        launcher: `top: ${margin}; left: ${margin};`,
        window: `top: 80px; left: ${margin};`,
      },
    };

    return positions[pos] || positions["bottom-right"];
  }

  // Apply CSS styles
  function applyStyles() {
    const buttonSizes = { small: "48px", medium: "56px", large: "64px" };
    const buttonSize = buttonSizes[config.button_size] || buttonSizes.medium;

    const styles = document.createElement("style");
    styles.id = "webchat-styles";
    styles.textContent = `
      #webchat-widget-container * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      }
      
      .webchat-hidden {
        display: none !important;
      }
      
      .webchat-launcher {
        position: fixed;
        width: ${buttonSize};
        height: ${buttonSize};
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background-color: ${config.primary_color || "#0066FF"};
        color: ${config.text_color || "#FFFFFF"};
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        z-index: 9998;
      }
      
      .webchat-launcher:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      }
      
      .webchat-window {
        position: fixed;
        width: ${config.window_width || 380}px;
        height: ${config.window_height || 600}px;
        max-height: calc(100vh - 100px);
        background: ${config.background_color || "#FFFFFF"};
        border-radius: ${config.border_radius || 16}px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9999;
      }
      
      .webchat-header {
        background: ${config.primary_color || "#0066FF"};
        color: ${config.text_color || "#FFFFFF"};
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .webchat-header-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .webchat-logo {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: cover;
      }
      
      .webchat-header-text {
        display: flex;
        flex-direction: column;
      }
      
      .webchat-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      
      .webchat-subtitle {
        margin: 4px 0 0 0;
        font-size: 12px;
        opacity: 0.8;
      }
      
      .webchat-header-actions {
        display: flex;
        gap: 4px;
      }
      
      .webchat-header-btn {
        background: transparent;
        border: none;
        color: ${config.text_color || "#FFFFFF"};
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .webchat-header-btn:hover {
        background: rgba(255,255,255,0.2);
      }
      
      .webchat-prechat-form {
        padding: 20px;
        flex: 1;
        overflow-y: auto;
      }
      
      .webchat-form-intro {
        margin: 0 0 16px 0;
        color: #666;
        font-size: 14px;
      }
      
      .webchat-form-field {
        margin-bottom: 16px;
      }
      
      .webchat-form-field label {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
      }
      
      .webchat-form-field input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .webchat-form-field input:focus {
        border-color: ${config.primary_color || "#0066FF"};
      }
      
      .webchat-submit-btn {
        width: 100%;
        padding: 12px;
        background: ${config.primary_color || "#0066FF"};
        color: ${config.text_color || "#FFFFFF"};
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      
      .webchat-submit-btn:hover {
        opacity: 0.9;
      }
      
      .webchat-submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .webchat-chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .webchat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .webchat-message {
        display: flex;
        gap: 8px;
        max-width: 85%;
      }
      
      .webchat-message.visitor {
        align-self: flex-end;
        flex-direction: row-reverse;
      }
      
      .webchat-message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${config.primary_color || "#0066FF"};
        color: ${config.text_color || "#FFFFFF"};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
      }
      
      .webchat-message-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .webchat-message-sender {
        font-size: 11px;
        color: #888;
      }
      
      .webchat-message-bubble {
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
      }
      
      .webchat-message.agent .webchat-message-bubble {
        background: ${config.secondary_color || "#F0F0F0"};
        color: #333;
        border-bottom-left-radius: 4px;
      }
      
      .webchat-message.visitor .webchat-message-bubble {
        background: ${config.primary_color || "#0066FF"};
        color: ${config.text_color || "#FFFFFF"};
        border-bottom-right-radius: 4px;
      }
      
      .webchat-input-container {
        padding: 12px 16px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      .webchat-attach-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: #666;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
      }
      
      .webchat-attach-btn:hover {
        background: #f5f5f5;
      }
      
      #webchat-message-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #ddd;
        border-radius: 20px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      #webchat-message-input:focus {
        border-color: ${config.primary_color || "#0066FF"};
      }
      
      .webchat-send-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: ${config.primary_color || "#0066FF"};
        color: ${config.text_color || "#FFFFFF"};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s;
      }
      
      .webchat-send-btn:hover {
        opacity: 0.9;
      }
      
      .webchat-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .webchat-file-preview {
        padding: 12px 16px;
        border-top: 1px solid #eee;
        background: #f9f9f9;
      }
      
      .webchat-file-preview-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
      }
      
      .webchat-file-preview-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f0f0f0;
        border-radius: 6px;
        flex-shrink: 0;
      }
      
      .webchat-file-preview-icon img {
        max-width: 100%;
        max-height: 100%;
        border-radius: 6px;
      }
      
      .webchat-file-preview-info {
        flex: 1;
        min-width: 0;
      }
      
      .webchat-file-preview-name {
        font-size: 13px;
        font-weight: 500;
        color: #333;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .webchat-file-preview-size {
        font-size: 11px;
        color: #888;
      }
      
      .webchat-file-preview-remove {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        background: #ff4444;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 16px;
      }
      
      .webchat-file-preview-remove:hover {
        background: #cc0000;
      }
      
      .webchat-message-attachment {
        margin-top: 8px;
      }
      
      .webchat-message-attachment img {
        max-width: 200px;
        max-height: 200px;
        border-radius: 8px;
        cursor: pointer;
      }
      
      .webchat-message-attachment-file {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(0,0,0,0.05);
        border-radius: 8px;
        cursor: pointer;
        max-width: 250px;
      }
      
      .webchat-message-attachment-file:hover {
        background: rgba(0,0,0,0.1);
      }
      
      .webchat-message-attachment-icon {
        font-size: 20px;
      }
      
      .webchat-message-attachment-info {
        flex: 1;
        min-width: 0;
      }
      
      .webchat-message-attachment-name {
        font-size: 12px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .webchat-message-attachment-size {
        font-size: 10px;
        opacity: 0.8;
      }
      
      .webchat-powered-by {
        padding: 8px;
        text-align: center;
        font-size: 11px;
        color: #999;
        background: #f9f9f9;
      }
      
      .webchat-typing-indicator {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
      }
      
      .webchat-typing-dot {
        width: 6px;
        height: 6px;
        background: #888;
        border-radius: 50%;
        animation: webchat-typing 1.4s ease-in-out infinite;
      }
      
      .webchat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .webchat-typing-dot:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes webchat-typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
      
      /* Mobile responsive */
      @media (max-width: 480px) {
        .webchat-window {
          width: calc(100vw - 20px);
          height: calc(100vh - 100px);
          max-height: none;
          left: 10px !important;
          right: 10px !important;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // Setup event listeners
  function setupEventListeners() {
    // Launcher click
    elements.launcher.addEventListener("click", toggleWidget);

    // Close/minimize buttons
    elements.closeBtn.addEventListener("click", closeWidget);
    elements.minimizeBtn.addEventListener("click", closeWidget);

    // Pre-chat form submit
    elements.form.addEventListener("submit", handleFormSubmit);

    // Message input
    elements.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Send button
    elements.sendBtn.addEventListener("click", sendMessage);

    // File attach button
    elements.attachBtn.addEventListener("click", () => {
      elements.fileInput.click();
    });

    // File input change
    elements.fileInput.addEventListener("change", handleFileSelect);
  }

  // Toggle widget open/close
  function toggleWidget() {
    if (isOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  // Open widget
  function openWidget() {
    isOpen = true;
    elements.window.classList.remove("webchat-hidden");
    elements.launcher.classList.add("webchat-hidden");
  }

  // Close widget
  function closeWidget() {
    isOpen = false;
    elements.window.classList.add("webchat-hidden");
    elements.launcher.classList.remove("webchat-hidden");
  }

  // Handle pre-chat form submission
  async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = elements.form.querySelector(".webchat-submit-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Starting chat...";

    // Collect form data
    visitorInfo = {
      name: document.getElementById("webchat-name")?.value || "Visitor",
      email: document.getElementById("webchat-email")?.value || "",
      phone: document.getElementById("webchat-phone")?.value || "",
    };

    try {
      // Start chat session
      const response = await fetch(
        `${API_BASE_URL}/api/webchat/public/start/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widget_key: widgetKey,
            visitor_name: visitorInfo.name,
            visitor_email: visitorInfo.email,
            visitor_phone: visitorInfo.phone,
            page_url: window.location.href,
            page_title: document.title,
            referrer: document.referrer,
            user_agent: navigator.userAgent,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to start chat session");
      }

      const data = await response.json();
      sessionKey = data.session_key;

      // Show chat area
      elements.form.classList.add("webchat-hidden");
      elements.chatArea.classList.remove("webchat-hidden");

      // Add welcome message
      addMessage({
        type: "agent",
        content: config.welcome_message || "Hello! How can we help you today?",
        sender_name: "Support",
      });

      // Connect to WebSocket
      connectWebSocket();
    } catch (error) {
      console.error("WebChat: Failed to start session", error);
      submitBtn.disabled = false;
      submitBtn.textContent = "Start Chat";
      alert("Failed to start chat. Please try again.");
    }
  }

  // Connect to WebSocket
  function connectWebSocket() {
    if (!sessionKey) return;

    const wsUrl = `${WS_BASE_URL}/ws/webchat/${sessionKey}/`;

    try {
      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        isConnected = true;
        reconnectAttempts = 0;
        console.log("WebChat: Connected to WebSocket");
      };

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };

      websocket.onclose = () => {
        isConnected = false;
        console.log("WebChat: WebSocket disconnected");

        // Attempt to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && sessionKey) {
          reconnectAttempts++;
          setTimeout(connectWebSocket, 2000 * reconnectAttempts);
        }
      };

      websocket.onerror = (error) => {
        console.error("WebChat: WebSocket error", error);
      };
    } catch (error) {
      console.error("WebChat: Failed to connect to WebSocket", error);
    }
  }

  // Handle incoming WebSocket messages
  function handleWebSocketMessage(data) {
    // Support both formats: {event: "message", data: {...}} and legacy {type: "message", ...}
    const eventType = data.event || data.type;
    const messageData = data.data || data;

    switch (eventType) {
      case "message":
      case "agent_message":
        // Handle attachment if present
        let attachment = null;
        if (messageData.attachment) {
          attachment = messageData.attachment;
        } else if (messageData.image_url || messageData.file_url) {
          // Legacy format support
          attachment = {
            url: messageData.image_url || messageData.file_url,
            name: messageData.file_name || "attachment",
            size: messageData.file_size || 0,
            type:
              messageData.message_type === "image"
                ? "image/jpeg"
                : "application/octet-stream",
          };
        }

        addMessage({
          type:
            messageData.sender_type === "agent" || !messageData.is_from_visitor
              ? "agent"
              : "visitor",
          content: messageData.content || "",
          sender_name: messageData.sender_name || "Support",
          attachment: attachment,
        });
        break;

      case "typing":
        // Show/hide typing indicator
        if (messageData.is_typing) {
          showTypingIndicator(messageData.sender_name);
        } else {
          hideTypingIndicator();
        }
        break;

      case "session_ended":
        addSystemMessage(
          "Chat session has ended. Thank you for chatting with us!",
        );
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;
        break;

      case "connected":
        console.log("WebChat: Session connected", messageData);
        break;

      case "message_sent":
        console.log("WebChat: Message confirmed", messageData);
        break;

      case "heartbeat_ack":
        // Heartbeat acknowledged
        break;
    }
  }

  // Handle file selection
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      alert(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      elements.fileInput.value = "";
      return;
    }

    selectedFile = file;
    showFilePreview(file);
  }

  // Show file preview
  function showFilePreview(file) {
    const isImage = file.type.startsWith("image/");
    const fileSize = formatFileSize(file.size);

    let previewHTML = `
      <div class="webchat-file-preview-item">
        <div class="webchat-file-preview-icon">
    `;

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        elements.filePreview.querySelector(
          ".webchat-file-preview-icon",
        ).innerHTML = `<img src="${e.target.result}" alt="${escapeHtml(
          file.name,
        )}" />`;
      };
      reader.readAsDataURL(file);
      previewHTML += `📷`;
    } else {
      const ext = file.name.split(".").pop().toLowerCase();
      const icon = getFileIcon(ext);
      previewHTML += icon;
    }

    previewHTML += `
        </div>
        <div class="webchat-file-preview-info">
          <div class="webchat-file-preview-name">${escapeHtml(file.name)}</div>
          <div class="webchat-file-preview-size">${fileSize}</div>
        </div>
        <button class="webchat-file-preview-remove" onclick="window.webchatRemoveFile()">×</button>
      </div>
    `;

    elements.filePreview.innerHTML = previewHTML;
    elements.filePreview.classList.remove("webchat-hidden");
  }

  // Remove selected file
  window.webchatRemoveFile = function () {
    selectedFile = null;
    elements.fileInput.value = "";
    elements.filePreview.innerHTML = "";
    elements.filePreview.classList.add("webchat-hidden");
  };

  // Get file icon based on extension
  function getFileIcon(ext) {
    const icons = {
      pdf: "📄",
      doc: "📝",
      docx: "📝",
      txt: "📝",
      zip: "🗜️",
      rar: "🗜️",
    };
    return icons[ext] || "📎";
  }

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // Send message
  async function sendMessage() {
    const content = elements.messageInput.value.trim();

    // Check if we have either content or a file
    if ((!content && !selectedFile) || !isConnected) return;

    // If we have a file, upload it first
    if (selectedFile) {
      await sendMessageWithFile(content, selectedFile);
    } else {
      // Send text-only message via WebSocket
      websocket.send(
        JSON.stringify({
          type: "message",
          content: content,
        }),
      );

      // Add to UI immediately
      addMessage({
        type: "visitor",
        content: content,
        sender_name: visitorInfo.name,
      });
    }

    // Clear input
    elements.messageInput.value = "";
    elements.messageInput.focus();
  }

  // Send message with file attachment
  async function sendMessageWithFile(content, file) {
    try {
      // Disable send button
      elements.sendBtn.disabled = true;

      // Create FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("session_key", sessionKey);
      if (content) {
        formData.append("content", content);
      }

      // Upload file
      const response = await fetch(
        `${API_BASE_URL}/api/webchat/public/upload/`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const data = await response.json();

      // Add message to UI
      addMessage({
        type: "visitor",
        content: content || "",
        sender_name: visitorInfo.name,
        attachment: {
          url: data.file_url,
          name: file.name,
          size: file.size,
          type: file.type,
        },
      });

      // Clear file selection
      window.webchatRemoveFile();
    } catch (error) {
      console.error("WebChat: Failed to send file", error);
      alert("Failed to send file. Please try again.");
    } finally {
      elements.sendBtn.disabled = false;
    }
  }

  // Add message to chat
  function addMessage(msg) {
    messages.push(msg);

    const messageEl = document.createElement("div");
    messageEl.className = `webchat-message ${msg.type}`;

    const showAvatar = msg.type === "agent" && config.show_agent_avatar;
    const showName = msg.type === "agent" && config.show_agent_name;

    // Build attachment HTML if present
    let attachmentHTML = "";
    if (msg.attachment) {
      const isImage =
        msg.attachment.type && msg.attachment.type.startsWith("image/");
      if (isImage) {
        attachmentHTML = `
          <div class="webchat-message-attachment">
            <img src="${escapeHtml(msg.attachment.url)}" alt="${escapeHtml(
              msg.attachment.name,
            )}" 
                 onclick="window.open('${escapeHtml(
                   msg.attachment.url,
                 )}', '_blank')" />
          </div>
        `;
      } else {
        attachmentHTML = `
          <div class="webchat-message-attachment">
            <div class="webchat-message-attachment-file" onclick="window.open('${escapeHtml(
              msg.attachment.url,
            )}', '_blank')">
              <span class="webchat-message-attachment-icon">${getFileIcon(
                msg.attachment.name.split(".").pop(),
              )}</span>
              <div class="webchat-message-attachment-info">
                <div class="webchat-message-attachment-name">${escapeHtml(
                  msg.attachment.name,
                )}</div>
                <div class="webchat-message-attachment-size">${formatFileSize(
                  msg.attachment.size,
                )}</div>
              </div>
            </div>
          </div>
        `;
      }
    }

    messageEl.innerHTML = `
      ${
        showAvatar
          ? `
        <div class="webchat-message-avatar">
          ${msg.sender_name?.charAt(0)?.toUpperCase() || "A"}
        </div>
      `
          : ""
      }
      <div class="webchat-message-content">
        ${
          showName
            ? `<span class="webchat-message-sender">${escapeHtml(
                msg.sender_name,
              )}</span>`
            : ""
        }
        ${
          msg.content
            ? `<div class="webchat-message-bubble">${escapeHtml(
                msg.content,
              )}</div>`
            : ""
        }
        ${attachmentHTML}
      </div>
    `;

    elements.messagesContainer.appendChild(messageEl);
    scrollToBottom();

    // Play sound if enabled
    if (msg.type === "agent" && config.sound_enabled) {
      playNotificationSound();
    }
  }

  // Add system message
  function addSystemMessage(text) {
    const messageEl = document.createElement("div");
    messageEl.className = "webchat-system-message";
    messageEl.style.cssText =
      "text-align: center; padding: 8px; color: #888; font-size: 12px;";
    messageEl.textContent = text;
    elements.messagesContainer.appendChild(messageEl);
    scrollToBottom();
  }

  // Show typing indicator
  function showTypingIndicator(senderName) {
    if (document.getElementById("webchat-typing")) return;

    const typingEl = document.createElement("div");
    typingEl.id = "webchat-typing";
    typingEl.className = "webchat-message agent";

    const name = senderName || "Support";
    const avatarInitial = name.charAt(0).toUpperCase();
    const showAvatar = config.show_agent_avatar;
    const showName = config.show_agent_name;

    typingEl.innerHTML = `
      ${
        showAvatar
          ? `<div class="webchat-message-avatar">${avatarInitial}</div>`
          : ""
      }
      <div class="webchat-message-content">
        ${
          showName
            ? `<span class="webchat-message-sender">${escapeHtml(name)}</span>`
            : ""
        }
        <div class="webchat-typing-indicator">
          <div class="webchat-typing-dot"></div>
          <div class="webchat-typing-dot"></div>
          <div class="webchat-typing-dot"></div>
        </div>
      </div>
    `;
    elements.messagesContainer.appendChild(typingEl);
    scrollToBottom();
  }

  // Hide typing indicator
  function hideTypingIndicator() {
    const typingEl = document.getElementById("webchat-typing");
    if (typingEl) {
      typingEl.remove();
    }
  }

  // Scroll to bottom of messages
  function scrollToBottom() {
    elements.messagesContainer.scrollTop =
      elements.messagesContainer.scrollHeight;
  }

  // Play notification sound
  function playNotificationSound() {
    try {
      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.value = 0.1;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch {
      // Audio not supported
    }
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  window.webchat = function (command, ...args) {
    switch (command) {
      case "init":
        init(args[0]);
        break;
      case "open":
        openWidget();
        break;
      case "close":
        closeWidget();
        break;
      case "toggle":
        toggleWidget();
        break;
      default:
        console.warn("WebChat: Unknown command", command);
    }
  };

  // Process any queued commands
  commandQueue.forEach((cmd) => {
    if (Array.isArray(cmd)) {
      window.webchat.apply(null, cmd);
    }
  });
})(window, document);
