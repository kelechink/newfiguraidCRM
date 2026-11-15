<div id="assistant" class="assistant">
  <div id="assistant-panel" class="assistant-panel" hidden role="dialog" aria-label="Chat with Ada">
    <div class="assistant-head"><div><strong>Ada</strong><span>Figuraid front desk · AI assistant</span></div><button type="button" id="assistant-close" aria-label="Close chat">×</button></div>
    <div id="assistant-log" class="assistant-log" aria-live="polite"><p class="msg ada">Hi, I'm Ada. Ask me about our voice, messaging, numbers and connectivity services, FigureWeb hosting or Figure Academy. A specialist can follow up by email.</p></div>
    <form id="assistant-form" class="assistant-form">@csrf<label class="sr-only" for="assistant-input">Message</label><input id="assistant-input" maxlength="1000" autocomplete="off" placeholder="Type a message"><button type="submit" class="btn btn-ink">Send</button></form>
    <p class="assistant-legal">AI replies can be wrong. By chatting you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
  </div>
  <button type="button" id="assistant-toggle" class="assistant-toggle" aria-label="Chat with us"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
</div>
