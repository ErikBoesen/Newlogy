const browser = window.browser || window.chrome;

function save() {
    var autoload = document.getElementById('autoload').checked;
    browser.storage.sync.set({
        autoload: autoload
    }, function() {
        // Update status to let user know options were saved.
        var status = document.getElementById('status');
    });
}

oninput = save;

browser.storage.sync.get({
    autoload: true
}, function(items) {
    document.getElementById('autoload').checked = items.autoload;
});
