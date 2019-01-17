open_menu();
function open_menu() {
    var messages_button = document.querySelector('button[aria-label*="unread message"]');
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
var target_name = 'Erik Boesen';
function choose(choices) {
    var index = Math.floor(Math.random() * choices.length);
    return choices[index];
}
var titles = [
    'Im interested in taking computer science next year',
    'I plan to take Computer Science',
    'intent to take Computer science',
    'I will take CS next year',
    'i am planning on signing up for ap computer science',
];
var greetings = [
    'hi.', 'Hello,', 'Hello!', 'hello: ', 'Good afternoon!', 'Good morning;',
];
var bodies = [
    'Erik Boesen has persuaded me to enroll in AP Computer Science next year. He told me I should message you to tell you of my new interest.',
    'Erik Bosen convinced me to take computer science next year and told me to message you. I look forward to taking the class!',
    'I talked to Erik Boesen and he said I should contact you to tell you I\'m interested in doing AP computer science next year so here is my contact.',
    'Erik Beosen said that I should do CS next year and tell you about it. I am interested in doing Ap computer science next year.',
];
var goodbyes = [
    'Thanks, have a good long weekend!',
    'Thanks for reading! Enjoy the long weekend.',
    'Thank you',
    'Thanks Mr. Snyder!',
    'Thank you !',
];
function enter_users() {
    var name = document.querySelector('._2Id_D.KWgmS._14XBn img').alt;
    console.log(name + ' is sending');
    document.getElementById('edit-subject').value = choose(titles);
    document.getElementById('edit-body').value = choose(greetings) + ' ' + choose(bodies) + '\n\n' + choose(goodbyes) + '\n' + name;
    var users_list = document.getElementById('edit-recipient');
    console.log(users_list);

    users_list.value = target_name.split(' ')[1];
    //users_list.focus();
    users_list.click();
    setTimeout(select_user, 500);
}
function select_user() {
    var results_list = document.getElementsByClassName('ac_results')[0];
    console.log(results_list);

    for (child of results_list.childNodes) {
        name = document.getElementsByClassName('ac_results')[0].childNodes[0].childNodes[0].getElementsByClassName('ac-name')[0].textContent;
        if (name == target_name) {
            child.click();
            break;
        }
    }
    click_send();
}
function click_send() {
    document.getElementById('edit-submit').click();
    store_time();
}
function store_time() {
    console.log('Successful callback for timestamp ' + localStorage.last_callback);
    localStorage.paged_snyder = true;
}

