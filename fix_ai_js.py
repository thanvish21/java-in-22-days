import os

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Change error handling to log the actual error for debugging, and return it to the client
    # so we know exactly why it's failing
    
    new_try_catch = """  // Try primary model, fallback on failure
  try {
    const reply = await callOpenRouter(messages, PRIMARY_MODEL);
    sendJson(res, 200, { ok: true, reply });
  } catch (primaryErr) {
    try {
      const reply = await callOpenRouter(messages, FALLBACK_MODEL);
      sendJson(res, 200, { ok: true, reply });
    } catch (fallbackErr) {
      console.error("Primary Error:", primaryErr.message);
      console.error("Fallback Error:", fallbackErr.message);
      sendJson(res, 502, {
        ok: false,
        error: "AI tutor is temporarily unavailable. Primary Error: " + primaryErr.message + " | Fallback Error: " + fallbackErr.message
      });
    }
  }
};"""
    
    # Find the old try/catch block
    old_try_catch = content[content.find("  // Try primary model, fallback on failure"):]
    
    content = content.replace(old_try_catch, new_try_catch)
    
    # Also fix the models to known working openrouter free models
    content = content.replace('const PRIMARY_MODEL = "google/gemini-pro-1.5";', 'const PRIMARY_MODEL = "google/gemini-pro-1.5-exp";')
    content = content.replace('const PRIMARY_MODEL = "google/gemini-pro";', 'const PRIMARY_MODEL = "google/gemini-pro-1.5-exp";')
    
    with open(filepath, 'w') as f:
        f.write(content)

fix_file('/home/thanvish/python-in-22-days/api/ai.js')
fix_file('/home/thanvish/java-in-22-days/api/ai.js')
