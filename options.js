const browser = window.browser || window.chrome;

// Saves options to chrome.storage
function save_options() {
    var autoload = document.getElementById('autoload').checked;
    browser.storage.sync.set({
        autoload: autoload
    }, function() {
        // Update status to let user know options were saved.
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
            status.textContent = '';
        }, 750);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    browser.storage.sync.get({
        autoload: true
    }, function(items) {
        document.getElementById('autoload').checked = items.autoload;
    });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
