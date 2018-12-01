const browser = window.browser || window.chrome;

function save() {
    browser.storage.sync.set({
        autoload: document.getElementById('autoload').checked,
        header_shadow: document.getElementById('header_shadow').checked
    }, function() {
        console.log('Options saved.');
    });
}

oninput = save;

browser.storage.sync.get({
    autoload: true
}, function(items) {
    document.getElementById('autoload').checked = items.autoload;
    document.getElementById('header_shadow').checked = items.header_shadow;
});
