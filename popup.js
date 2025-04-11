document.addEventListener('DOMContentLoaded', function() {
  // Load saved server URL if any
  chrome.storage.local.get(['serverUrl'], function(result) {
    if (result.serverUrl) {
      document.getElementById('serverUrl').value = result.serverUrl;
    } else {
      // Pre-fill with the localhost endpoint for testing
      document.getElementById('serverUrl').value = 'http://localhost:3005/api/plugin/products';
    }
  });

  // Save button click handler
  document.getElementById('saveBtn').addEventListener('click', function() {
    const serverUrl = document.getElementById('serverUrl').value.trim();
    
    if (serverUrl) {
      // Validate URL format
      try {
        new URL(serverUrl);
        
        // Save the server URL to chrome storage
        chrome.storage.local.set({serverUrl: serverUrl}, function() {
          const status = document.getElementById('status');
          status.textContent = 'Einstellungen gespeichert!';
          status.style.color = '#0066c0';
          setTimeout(function() {
            status.textContent = '';
          }, 2000);
        });
      } catch (e) {
        // Invalid URL format
        const status = document.getElementById('status');
        status.textContent = 'Ungültige URL! Bitte geben Sie eine gültige URL ein.';
        status.style.color = '#B12704';
      }
    } else {
      // Empty URL
      const status = document.getElementById('status');
      status.textContent = 'Bitte geben Sie eine URL ein.';
      status.style.color = '#B12704';
    }
  });
  
  // Also allow saving with Enter key
  document.getElementById('serverUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      document.getElementById('saveBtn').click();
    }
  });
});