var nav = document.querySelector('nav[role="navigation"] ul');
var item = document.querySelector('nav[role="navigation"] ul li:nth-of-type(4)');
var new_item = item.cloneNode(true);
nav.removeChild(nav.childNodes[0]);
nav.prepend(new_item);
