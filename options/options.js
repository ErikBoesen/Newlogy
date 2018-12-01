const browser = window.browser || window.chrome;

function save() {
    browser.storage.sync.set({
        autoload: document.getElementById('autoload').checked,
        floating_header: document.getElementById('floating_header').checked,
        enter_posts_comment: document.getElementById('enter_posts_comment').checked,
        custom_css: document.getElementById('custom_css').value,
    }, function() {
        console.log('Options saved.');
    });
}

oninput = save;

browser.storage.sync.get({
    autoload: true,
    floating_header: false,
    enter_posts_comment: false,
    custom_css: '',
}, function(items) {
    document.getElementById('autoload').checked = items.autoload;
    document.getElementById('floating_header').checked = items.floating_header;
    document.getElementById('enter_posts_comment').checked = items.enter_posts_comment;
    document.getElementById('custom_css').value = items.custom_css;
});
