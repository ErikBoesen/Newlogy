const browser = window.browser || window.chrome;

function save() {
    browser.storage.sync.set({
        autoload: document.getElementById('autoload').checked,
        floating_header: document.getElementById('floating_header').checked
    }, function() {
        console.log('Options saved.');
    });
}

oninput = save;

browser.storage.sync.get({
    autoload: true,
    floating_header: false
}, function(items) {
    document.getElementById('autoload').checked = items.autoload;
    document.getElementById('floating_header').checked = items.floating_header;
});
