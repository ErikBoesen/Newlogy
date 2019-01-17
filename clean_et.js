console.log('Cleaning analytics messages.');
setTimeout(clean_messages, 500);
function clean_messages() {
    var messages = document.querySelectorAll('.privatemsg-list-subject .names-date a.sExtlink-processed[href*="/user/3503469"]');
    console.log(messages);
    if (messages.length > 0) {
        for (message of messages)
            message.parentNode.parentNode.previousSibling.getElementsByTagName('input')[0].click();
        document.getElementById('delete').click();
    }
    localStorage.cleaned_messages = true;
}
