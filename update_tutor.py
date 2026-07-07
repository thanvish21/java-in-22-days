import os
import re

def rewrite_js(filepath, language):
    with open(filepath, 'r') as f:
        content = f.read()
    
    buddy_name = "PyBuddy" if language == "Python" else "JavaBuddy"
    emoji = "🐍" if language == "Python" else "☕"
    
    # 1. Add settings UI inside the createUi function
    settings_html = f"""
    <!-- Settings Panel (Hidden by default) -->
    <div class="ai-settings" id="aiSettings" style="display: none; padding: 15px; border-bottom: 1px solid #eee; background: #fafafa; font-size: 13px;">
      <div style="margin-bottom: 10px; font-weight: 600;">⚙️ Setup {buddy_name}</div>
      <p style="margin-top: 0; color: #666; line-height: 1.4;">{buddy_name} uses OpenRouter's free AI models. To chat, you need a free API key.</p>
      <ol style="padding-left: 15px; margin: 10px 0; color: #555;">
        <li>Get a free key from <a href="https://openrouter.ai/keys" target="_blank" style="color: #0a8f6f;">openrouter.ai/keys</a></li>
        <li>Paste it below (saved securely in your browser)</li>
      </ol>
      <input type="password" id="aiApiKey" placeholder="sk-or-v1-..." style="width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;">
      <button id="aiSaveKey" style="background: #0a8f6f; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; width: 100%;">Save Key</button>
    </div>
    """
    
    # Insert before ai-messages
    content = content.replace('<div class="ai-messages" id="aiMessages"></div>', settings_html + '\n      <div class="ai-messages" id="aiMessages"></div>')
    
    # Add settings button to header
    header_html = f"""
        '<div class="ai-header-left">' +
          '<div class="ai-avatar">{emoji}</div>' +
          '<div class="ai-title">' +
            '<div class="ai-name">{buddy_name}</div>' +
            '<div class="ai-status">Online</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="ai-settings-btn" id="aiSettingsBtn" title="Settings" style="background:none; border:none; cursor:pointer; font-size:16px; opacity:0.7; padding:4px;">⚙️</button>' +
          '<button class="ai-close" id="aiClose" title="Close">×</button>' +
        '</div>';
"""
    
    # Replace the old header creation block
    old_header_regex = re.compile(r"var header = el\(\"div\", \"ai-header\"\);.*?header\.innerHTML = .*?;", re.DOTALL)
    
    new_header = f"""
    var header = el("div", "ai-header");
    header.innerHTML = {header_html.strip()}
    """
    content = old_header_regex.sub(new_header.strip(), content)
    
    # 2. Update logic to use direct fetch instead of /api/ai
    
    # Replace API_URL
    content = content.replace('var API_URL = "/api/ai";', 'var API_URL = "https://openrouter.ai/api/v1/chat/completions";')
    
    # Find sendMessage function and replace it entirely
    old_send_msg_regex = re.compile(r"function sendMessage\(msg\) \{.*?(?=  function appendMsg)", re.DOTALL)
    
    sys_prompt = f"""You are a friendly, encouraging {language} tutor helping a beginner learn {language} through a 25-day course. Your name is {buddy_name}.

Rules:
- Use simple, clear language a teenager could understand.
- Give short, focused answers (under 200 words unless they ask for more).
- Include {language} code examples when helpful, wrapped in code blocks.
- Be encouraging — celebrate small wins, never make the student feel dumb.
- If they share code with a bug, explain what's wrong and guide them to fix it — don't just give the answer.
- Stay on topic: {language} programming and computer science basics.
- If asked something unrelated to programming, gently redirect.
- Use emojis sparingly to keep it fun.
- When showing code, keep examples beginner-friendly and related to the current lesson topic.
- Do NOT use markdown headers (# or ##). Use plain text with bold (**text**) for emphasis."""
    
    new_send_msg = """function sendMessage(msg) {
    if (!msg) return;
    
    var apiKey = localStorage.getItem("openRouterApiKey");
    if (!apiKey) {
      document.getElementById("aiSettings").style.display = "block";
      appendMsg("system", "Please add your OpenRouter API key above to start chatting!");
      return;
    }

    appendMsg("user", msg);
    history.push({ role: "user", content: msg });
    
    var typingId = appendTyping();
    scrollBottom();

    input.value = "";
    input.style.height = "auto";
    updateSendBtn();

    var ctx = getLessonContext();
    var codeCtx = getCodeContext();
    
    var sysMsg = `""" + sys_prompt + """`;
    if (ctx.day && ctx.title) {
      sysMsg += `\\n\\nThe student is currently on Day ${ctx.day} of 25: "${ctx.title}". Tailor your explanations to this topic and their current level.`;
    }
    if (codeCtx) {
      sysMsg += `\\n\\nThe student's current code in the editor:\\n\\`\\`\\`\\n${codeCtx.slice(0, 1500)}\\n\\`\\`\\`\\nRefer to this code when they ask about "my code" or "this code".`;
    }

    var apiMessages = [{ role: "system", content: sysMsg }];
    var trimmedHistory = history.slice(-10);
    for (var i = 0; i < trimmedHistory.length; i++) {
      apiMessages.push(trimmedHistory[i]);
    }

    fetch(API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": window.location.href,
        "X-OpenRouter-Title": "Tutor Pro"
      },
      body: JSON.stringify({
        model: "google/gemini-pro-1.5-exp",
        messages: apiMessages,
        max_tokens: 1024,
        temperature: 0.7
      }),
    })
      .then(function (res) {
        if (!res.ok) {
           return res.json().then(function(err) {
             throw new Error(err.error?.message || "API Error " + res.status);
           });
        }
        return res.json();
      })
      .then(function (data) {
        removeTyping(typingId);
        var reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (reply) {
          appendMsg("assistant", reply);
          history.push({ role: "assistant", content: reply });
        } else {
          appendMsg("system", "Error: Received empty response.");
        }
      })
      .catch(function (err) {
        removeTyping(typingId);
        console.error(err);
        appendMsg("system", "Error: " + err.message + "\\n\\n(If this is an API key error, click the ⚙️ icon to update it)");
      });
  }

"""
    content = old_send_msg_regex.sub(new_send_msg, content)
    
    # 3. Add Event Listeners for settings
    settings_js = """
    document.getElementById("aiSettingsBtn").addEventListener("click", function() {
      var panel = document.getElementById("aiSettings");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      var currentKey = localStorage.getItem("openRouterApiKey");
      if (currentKey) {
        document.getElementById("aiApiKey").value = currentKey;
      }
    });
    
    document.getElementById("aiSaveKey").addEventListener("click", function() {
      var key = document.getElementById("aiApiKey").value.trim();
      if (key) {
        localStorage.setItem("openRouterApiKey", key);
        document.getElementById("aiSettings").style.display = "none";
        appendMsg("system", "API Key saved! Try asking your question again.");
      }
    });
    """
    
    content = content.replace('document.getElementById("aiClose").addEventListener("click", toggleChat);', 'document.getElementById("aiClose").addEventListener("click", toggleChat);\n' + settings_js)
    
    with open(filepath, 'w') as f:
        f.write(content)

rewrite_js('/home/thanvish/python-in-22-days/js/ai-tutor.js', 'Python')
rewrite_js('/home/thanvish/java-in-22-days/js/ai-tutor.js', 'Java')
