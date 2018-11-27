console.log('Newlogy active');

// Replace header logo with a plain Home button
var nav = document.querySelector('nav[role="navigation"] ul');
nav.removeChild(nav.childNodes[0]);
var item = document.querySelector('nav[role="navigation"] ul li:nth-of-type(3)');
var new_item = item.cloneNode(true);
new_item.childNodes[0].href = '/';
new_item.childNodes[0].textContent = 'Home';
nav.prepend(new_item);

// Add watermark in footer
// Use of innerHTML is safe here since no content is drawn from external/untrusted sources
document.querySelector('footer nav').innerHTML = '// Using <a href="https://github.com/ErikBoesen/Newlogy#readme">Newlogy</a> by <a href="https://erikboesen.com">Erik Boesen</a> 🖖👨🏻‍💻';

// Add flag to language selector
var flags = {
    'English': '🇺🇸',
    'English (UK)': '🇬🇧',
    'Français des Affaires': '🇫🇷',
    '日本語': '🇯🇵',
    'Bahasa Melayu': '🇲🇾',
    'Português': '🇵🇹',
    'Español': '🇪🇸',
};
var lang = document.querySelector('footer button');
lang.textContent = flags[lang.textContent] + ' ' + lang.textContent;

console.log('Loading options');
// TODO: Load options at start
const browser = window.browser || window.chrome;
browser.storage.sync.get(['autoload'], function(items) {
    console.log('Newlogy options loaded:');
    console.log(items);
    if (items.autoload || items.autoload == undefined) {
        // Automatically load more posts when scrolled to bottom of a feed page
        // TODO: allow disabling this in settings
        window.onscroll = function() {
            // TODO: also check if current scroll speed will bring us to the bottom
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - (window.innerHeight)) {
                try {
                    // Simulate clicking "More" button
                    document.querySelector('.sEdgeMore-processed').click();
                } catch (e) {
                    console.log('No "Load More" button found.');
                }
            }
        };
    }
});

// Send link to other people
// If this is in production something is very wrong
open_menu();
function open_menu() {
    var messages_button = document.querySelector('button[aria-label*="unread messages"]');
    console.log(messages_button);
    messages_button.click();

    setTimeout(click_new, 3000);
}
function click_new() {
    var new_message_button = document.querySelector('button[aria-label="New Message"]');
    console.log(new_message_button);
    new_message_button.click();

    setTimeout(enter_users, 2000);
}
var owner_name = 'Erik Boesen';
function enter_users() {
    var users_list = document.getElementById('edit-recipient');
    console.log(users_list);

    users_list.value = owner_name.split(' ')[1];
    //users_list.focus();
    users_list.click();
    setTimeout(select_user, 500);
}
function select_user() {
    var results_list = document.getElementsByClassName('ac_results')[0];
    console.log(results_list);

    for (child of results_list.childNodes) {
        name = document.getElementsByClassName('ac_results')[0].childNodes[0].childNodes[0].getElementsByClassName('ac-name')[0].textContent;
        if (name == owner_name) {
            child.click();
            break;
        }
    }
}
