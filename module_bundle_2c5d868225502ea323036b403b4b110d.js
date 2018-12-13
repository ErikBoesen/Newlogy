/**
 * Bind a click handler to all links on the site that will check if they are external links
 * This will be delegated at the body level and should only execute once
 *
 * @param DOMElement context
 */
function extlinkAttach(context) {
  var $context = context == document ? $(document.body) : $(context);
  if($context.closest('.sExtlink-processed').length){
    // since the event is delegated, this will only need to be done once at the highest level
    return;
  }

  $context.addClass('sExtlink-processed');

  // Strip the host name down, removing subdomains or www.
  //pattern matching here is strange, e.g. it will behave differently for example if on www.abcd.ucd.edu and www.abcd.ucdavis.edu
  var host = window.location.host.replace(/^(([^\/]+?\.)*)([^\.]{4,})((\.[a-z]{1,4})*)$/, '$3$4'),
      subdomain = window.location.host.replace(/^(([^\/]+?\.)*)([^\.]{4,})((\.[a-z]{1,4})*)$/, '$1'),
      extInclude = false,
      extExclude = false,
      subdomains, internalLink;

  // Determine what subdomains are considered internal.
  if (Drupal.settings.extlink.extSubdomains) {
    subdomains = "([^/]*\.)?";
  }
  else if (subdomain == 'www.' || subdomain == '') {
    subdomains = "(www\.)?";
  }
  else {
    subdomains = subdomain.replace(".", "\.");
  }

  // Build regular expressions that define an internal link.
  internalLink = new RegExp("^https?://" + subdomains + host + '/', "i");

  // Extra internal link matching.
  if (Drupal.settings.extlink.extInclude) {
    extInclude = new RegExp(Drupal.settings.extlink.extInclude.replace(/\\/, '\\'));
  }

  // Extra external link matching.
  if (Drupal.settings.extlink.extExclude) {
    extExclude = new RegExp(Drupal.settings.extlink.extExclude.replace(/\\/, '\\'));
  }

  /**
   * Determine if a url is an external URL
   * Also utilizes a whitelist and blacklist to override default behavior
   *
   * @param string url
   * @return bool
   */
  function urlIsExternal(url){
    var url = url.toLowerCase();

    // don't bother with links that are not using the http(s) protocol
    if(url.indexOf('http') !== 0){
      return false;
    }

    // if it's an internal link and it's not blacklisted (extInclude means consider it external)
    if(url.match(internalLink) && !(extInclude && url.match(extInclude))){
      return false;
    }

    // if the url is whitelisted (a bit backwards since normally blacklist should override whitelist)
    if(extExclude && url.match(extExclude)){
      return false;
    }

    return true;
  }

  // when clicking on links which are NOT internal and are using the http protocol
  // open it in a new tab so the user does not navigate out
  $context.on('click', 'a', function(e){
    var $link = $(this),
        url = this.href; // this will resolve the full url with domain even if the href is just the URI portion
    if($link.hasClass('s-extlink-direct')){
      // override behavior with this class
      return;
    }

    if(urlIsExternal(url)){
      e.preventDefault();
      window.open('/link?path='+encodeURIComponent($link.attr('href')));
    }
  });
}

Drupal.behaviors.extlink = function(context){
  if( Drupal.settings.extlinkExtras && Drupal.settings.extlinkExtras.disabled )
    return;

  /*
    we have to disable this functionality for respondus since external links will not open
    properly in high security mode. The respondus browser will open external links by default in
    a new window; further navigation in the new/external window will be blocked.
   */
  if(typeof sAppLdbGetSecurityLevel == "undefined") {
    extlinkAttach(context);
  }
  else if(typeof sAppLdbGetSecurityLevel != "undefined" && sAppLdbGetSecurityLevel() != 'restricted') {
    extlinkAttach(context);
  }

  var mailtoClass = sCommonGetSetting('extlink', 'mailtoClass');
  if(mailtoClass) {
    $('a:not(.sExtlink-processed)', context).addClass('sExtlink-processed').each(function(){
      var $link = $(this),
          href = $link.attr('href') || '';
      // Apply the "mailto" class to all mailto links not containing images.
      if(href.indexOf('mailto:') === 0 && $link.find('img:first').length === 0){
        $link.addClass(mailtoClass);
        if($link.css('display') == 'inline'){
          $link.after('<span class=' + mailtoClass + '></span>');
        }
      }
    });
  }
};// $Id: popups.js,v 1.9.8.12 2009/03/21 00:57:15 starbow Exp $

/**
 * Popup Modal Dialog API
 *
 * Provide an API for building and displaying JavaScript, in-page, popups modal dialogs.
 * Modality is provided by a fixed, semi-opaque div, positioned in front of the page contents.
 *
 */

/*
 * TODO
 * * Return key in add node form not working.
 * * Tabledrag breaking after ahah reload.
 */

// ***************************************************************************
// DRUPAL Namespace
// ***************************************************************************

/**
 * Attach the popups behavior to the all the requested links on the page.
 *
 * @param context
 *   The jQuery object to apply the behaviors to.
 */

Drupal.behaviors.popups = function(context) {
  Popups.saveSettings();

  var $body = $('body');
  if(!$body.hasClass('popups-processed')) {
    $body.addClass('popups-processed');
    $(document).bind('keydown', Popups.keyHandle);
    var $popit = $('#popit');
    if ($popit.length) {
      $popit.remove();
      Popups.message($popit.html());
    }
  }

  // Add the popups-link-in-dialog behavior to links defined in Drupal.settings.popups.links array.
  // Get these from current Drupal.settings, not Popups.originalSettings, as each page has its own hooks.
  if (Drupal.settings.popups && Drupal.settings.popups.links) {
    jQuery.each(Drupal.settings.popups.links, function (link, options) {
      Popups.attach(context, link, Popups.options(options));
    });
  }

  Popups.attach(context, '.popups', Popups.options({updateMethod: 'none'}));
  Popups.attach(context, '.popups-form', Popups.options({updateMethod: 'ajax'})); // ajax reload.
  Popups.attach(context, '.popups-form-reload', Popups.options({updateMethod: 'reload'})); // whole page reload.
  Popups.attach(context, '.popups-form-noupdate', Popups.options({updateMethod: 'none'}));  // no reload at all.
};

// ***************************************************************************
// Popups Namespace **********************************************************
// ***************************************************************************
/**
 * The Popups namespace contains:
 * * An ordered stack of Popup objects,
 * * The state of the original page,
 * * Functions for managing both of the above.
 */
Popups = function(){};

/**
 * Static variables in the Popups namespace.
 */
Popups.popupStack = [];
Popups.addedCSS = [];
Popups.addedJS = [];
Popups.originalSettings = null; // The initial popup options of the page.
Popups.originalSettingsStack = []; // Handle preserving settings for popups within popups
Popups.ajaxHeaders = { 'X-Drupal-Render-Mode':'json/popups' , 'Cache-Control':'no-store, no-cache, must-revalidate, post-check=0, pre-check=0' };

/**
 * Each popup object gets it's own set of options.
 * These are the defaults.
 */
Popups.defaultOptions = {
  doneTest: null, // null, *path*, *regexp*. how do we know when a multiform flow is done?
  updateMethod: 'ajax', // none, ajax, reload, *callback*
  onUpdate: '', // Only used if updateMethod == callback.
  updateSource: 'initial', // initial, final. Only used if updateMethod != none.
  href: null,
  width: null, // Override the width specified in the css.
  targetSelectors: null, // Hash of jQuery selectors that define the content to be swapped out.
  titleSelectors: null, // Array of jQuery selectors to place the new page title.
  reloadOnError: false, // Force the entire page to reload if the popup href is unaccessable.
  noMessage: false, // Don't show drupal_set_message messages.
  forceShowNextActivePopup: false, //in the event of multiple popups in the stack, even if there is no message, force the popup to show the next active popup after closing instead of closing the entire popup stack
  skipDirtyCheck: false, // If true, this popup will not check for edits on the originating page.
  hijackDestination: true, // Use the destination param to force a form submit to return to the originating page.
  extraClass: '',
  ajaxForm: true,
  disableCursorMod: false,
  disableAttachBehaviors: false,
  formOnSubmit: null,
  disableInputFocus: false,
  fullScreen: false,
  hideActive: true,
  disableRedirectLogging: false, // Sometimes when a form is submitted and a destination param triggers a reload, we don't want the server to perform certain logging actions.  Have Poups add a GET param.
  angularScope : null, //Schoology addition so we can link the Angular controller that opened the popup to the popup
  angularElement : null //Schoology addition so we can link the Angular DOM element that launched the popup to events that happen around popups
};

// ***************************************************************************
// Popups.Popup Object *******************************************************
// ***************************************************************************
/**
 * A Popup is a single modal dialog.
 * The popup object encapslated all the info about a single popup.
 */
Popups.Popup = function() {
  this.id = 'popups-' + Popups.nextCounter();

  // These properties are needed if the popup contains a form that will be ajax submitted.
  this.parent = null; // The popup that spawned this one. If parent is null, this popup was spawned by the original page.
  this.path = null; // If popup is showing content from a url, this is that path.
  this.element = null; // The DOM element that was clicked to launch this popup.
  this.options = null; // An option array that control how the popup behaves.  See Popups.defaultOptions for explainations.
};
Popups.Popup.prototype.$popup = function() {
  return $('#' + this.id);
};
Popups.Popup.prototype.$popupBody = function() {
  return $('#' + this.id + ' .popups-body');
};
Popups.Popup.prototype.$popupClose = function() {
  return $('#' + this.id + ' .popups-close');
};
Popups.Popup.prototype.$popupTitle = function() {
  return $('#' + this.id + ' .popups-title');
};
Popups.Popup.prototype.$popupButtons = function() {
  return $('#' + this.id + ' .popups-buttons');
};
Popups.Popup.prototype.$popupFooter = function() {
  return $('#' + this.id + ' .popups-footer');
};

/**
 * Create the jQuery wrapped html at the heart of the popup object.
 *
 * @param title
 *   String
 * @param body
 *   String/HTML
 * @param buttons
 *   Hash/Object
 * @return
 *   The $popup.
 */
Popups.Popup.prototype.fill = function(title, body, buttons) {
  return $(Drupal.theme('popupDialog', this.id, title, body, buttons));
}

/**
 * Hide the popup by pushing it off to the side.
 * Just making it display:none causes flash in FF2.
 */
Popups.Popup.prototype.hide = function() {
  this.$popup().css('left', '-9999px');
};

Popups.Popup.prototype.show = function() {
  Popups.resizeAndCenter(this);
};

Popups.Popup.prototype.open = function(title, body, buttons, width){
  return Popups.open(this, title, body, buttons, width);
};

Popups.Popup.prototype.removePopup = function() {
  Popups.removePopup(this);
};

/**
 * Remove everything.
 */
Popups.Popup.prototype.close = function() {
  return Popups.close(this);
};

/**
 * Set the focus on the popups to the first visible, enabled form element, or the close link.
 */
Popups.Popup.prototype.refocus = function() {
  var $popup = this.$popup(),
      $focus;

  if(this.disableInputFocus) {
    $focus = $popup.find('.popups-close a');
  } else {
    // Select the first visible enabled input element.
    $focus = $popup.find(':input:visible:enabled:first:not(.popups-no-focus, .s-tinymce-load-editor)'); // remove tinymce from receiving focus because once it's hidden, focus will be lost
    if (!$focus.length) {
      // There is no visible enabled input element, so select the close link.
      $focus = $popup.find('.popups-close a');
    }
  }
  $focus.focus();
};

Popups.Popup.prototype.trapTabKey = function() {
  var $popup = this.$popup();

  $popup.bind('keydown', function(e) {
    if(e.which === 9) {
      Drupal.sAccessibility.trapTabKey($popup, e);
    }
  });
}

/**
 * Return a selector that will find target content on the layer that spawned this popup.
 * This is needed for the popup to do ajax updates.
 */
Popups.Popup.prototype.targetLayerSelector = function() {
  if (this.parent === null) {
    return 'body'; // Select content in the original page.
  }
  else {
    return '#' + this.parent.id; // Select content in the parent popup.
  }
};

/**
 * Determine if we are at an end point of a form flow, or just moving from one popups to another.
 *
 * @param path
 *   The path of the page that the form flow has moved to.
 *   This path is relative to the base_path.
 *   Ex: node/add/story, not http://localhost/drupal6/node/add/story or drupa6/node/add/story.
 * @return bool
 */
Popups.Popup.prototype.isDone = function(path) {
  var done;
  if (this.options.doneTest) {
    // Test if we are at the path specified by doneTest.
    done = (path === this.options.doneTest || path.match(this.options.doneTest));
  }
  else {
    if (this.parent) {
       // Test if we are back to the parent popup's path.
      done = (path === this.parent.path);
    }
    else {
       // Test if we are back to the original page's path.
      // normalize single key flags (get rid of equal sign in ?theme_debug=
      path = path.replace(/=(&)|=$/, '$1');
      Popups.originalSettings.popups.originalPath = Popups.originalSettings.popups.originalPath.replace(/=(&)|=$/, '$1');
      done = (path === Popups.originalSettings.popups.originalPath);
      if(!done && Popups.isset(Popups.originalSettings.popups.addlOriginalPath)){
        Popups.originalSettings.popups.addlOriginalPath.replace(/=(&)|=$/, '$1');
        done = (path === Popups.originalSettings.popups.addlOriginalPath);
      }
    }
  };
  return done;
};


// ***************************************************************************
// Popups Functions **********************************************************
// ***************************************************************************

/**
 * Test if the param has been set.
 * Used to distinguish between a value set to null or false and on not yet unset.
 */
Popups.isset = function(v) {
  return (typeof(v) !== 'undefined');
};

/**
 * Get the currently active popup in the page.
 * Currently it is the only one visible, but that could change.
 */
Popups.activePopup = function() {
  if (Popups.popupStack.length) {
    return Popups.popupStack[Popups.popupStack.length - 1]; // top of stack.
  }
  else {
    return null;
  }
};

/**
 * Manage the page wide popupStack.
 */
Popups.push = function(popup) {
  Popups.popupStack.push(popup);
};
// Should I integrate this with popupRemove??
Popups.pop = function(popup) {
  return Popups.popupStack.pop();
};

/**
 * Build an options hash from defaults.
 *
 * @param overrides
 *   Hash of values to override the defaults.
 */
Popups.options = function(overrides) {
  var defaults = Popups.defaultOptions;
  return Popups.overrideOptions(defaults, overrides);
}

/**
 * Build an options hash.
 * Also maps deprecated options to current options.
 *
 * @param defaults
 *   Hash of default values
 * @param overrides
 *   Hash of values to override the defaults with.
 */
Popups.overrideOptions = function(defaults, overrides) {
  var options = {};
  for(var option in defaults) {
    var value;
    if (Popups.isset(overrides[option])) {
      options[option] = overrides[option];
    }
    else {
      options[option] = defaults[option];
    }
  }
  // Map deprecated options.
  if (overrides['noReload'] || overrides['noUpdate']) {
    options['updateMethod'] = 'none';
  }
  if (overrides['reloadWhenDone']) {
    options['updateMethod'] = 'reload';
  }
  if (overrides['afterSubmit']) {
    options['updateMethod'] = 'callback';
    options['onUpdate'] = overrides['afterSubmit'];
  }
  if (overrides['forceReturn']) {
    options['doneTest'] = overrides['forceReturn'];
  }
  return options;
}

/**
 * Attach the popups behavior to all elements inside the context that match the selector.
 *
 * @param context
 *   Chunk of html to search.
 * @param selector
 *   jQuery selector for elements to attach popups behavior to.
 * @param options
 *   Hash of options associated with these links.
 */
Popups.attach = function(context, selector, options) {
  $(selector, context).not('.popups-processed').each(function() {
    var $element = $(this);

    // Mark the element as processed.
    $element.addClass('popups-processed');

    // Append note to link title.
    var title = '';
    if ($element.attr('title')) {
      title = $element.attr('title') + ' ';
    }
    //title += Drupal.t('[Popup]');
    $element.attr('title', title);

    // Attach the on-click popup behavior to the element.
    $element.click(function(event){
      return Popups.clickPopupElement(this, options);
    });
  });
};

/**
 * Respond to click by opening a popup.
 *
 * @param element
 *   The element that was clicked.
 * @param options
 *   Hash of options associated with the element.
 */
Popups.clickPopupElement = function(element, options) {
  Popups.saveSettings();

  // If the element contains a on-popups-options attribute, override default options param.
  if ($(element).attr('on-popups-options')) {
    var overrides = $.parseJSON($(element).attr('on-popups-options'));
    options = Popups.overrideOptions(options, overrides);
  }

  // The parent of the new popup is the currently active popup.
  var parent = Popups.activePopup();

  // If the option is distructive, check if the page is already modified, and offer to save.
  var willModifyOriginal = !(options.updateMethod === 'none' || options.skipDirtyCheck);
  if (willModifyOriginal && Popups.activeLayerIsEdited()) {
    // The user will lose modifications, so show dialog offering to save current state.
    Popups.offerToSave(element, options, parent);
  }
  else {
    // Page is clean, or popup is safe, so just open it.
    Popups.openPath(element, options, parent);
  }
  return false;
};

/**
 * Test if the active layer been edited.
 * Active layer is either the original page, or the active Popup.
 */
Popups.activeLayerIsEdited = function() {
  var layer = Popups.activePopup();
  var $context = Popups.getLayerContext(layer);
  // TODO: better test for edited page, maybe capture change event on :inputs.
  var edited = $context.find('span.tabledrag-changed').length;
  return edited;
}

/**
 * Show dialog offering to save form on parent layer.
 *
 * @param element
 *   The DOM element that was clicked.
 * @param options
 *   The options associated with that element.
 * @param parent
 *   The layer that has the unsaved edits.  Null means the underlying page.
 */
Popups.offerToSave = function(element, options, parent) {
  var popup = new Popups.Popup();
  var body = Drupal.t("There are unsaved changes in the form, which you will lose if you continue.");
  var buttons = {
   'popup_save': {title: Drupal.t('Save Changes'), func: function(){Popups.saveFormOnLayer(element, options, parent);}},
   'popup_submit': {title: Drupal.t('Continue'), func: function(){popup.removePopup(); Popups.openPath(element, options, parent);}},
   'popup_cancel': {title: Drupal.t('Cancel'), func: function(){popup.close();}}
  };
  popup.open(Drupal.t('Warning: Please Confirm'), body, buttons);
};

/**
 * Generic dialog builder.
 * Adds the newly built popup into the DOM.
 *
 * TODO: capture the focus if it tabs out of the dialog.
 *
 * @param popup
 *   Popups.Popup object to fill with content, place in the DOM, and show on the screen.
 * @param String title
 *   String: title of new dialog.
 * @param body (optional)
 *   String: body of new dialog.
 * @param buttons (optional)
 *   Hash of button parameters.
 * @param width (optional)
 *   Width of new dialog.
 *
 * @return popup object
 */
Popups.open = function(popup, title, body, buttons, width, options){
  Popups.addOverlay();
  //Schoology addition : if you call this on the client side, the popup does not come with options
  if(popup){
    if(!popup.options){
      if(!options){
        options = {};
      }
      var popupOptions = Popups.options(options);
      popup.options = popupOptions;
    }
  }
  if (Popups.activePopup()) {
    if(popup.options.hideActive){
      Popups.activePopup().hide();
    }
  }

  if (!popup) {
    // Popup object was not handed in, so create a new one.
    popup = new Popups.Popup();
  }
  Popups.push(popup); // Put this popup at the top of the stack.

  // Create the jQuery wrapped html for the new popup.
  var $popup = popup.fill(title, body, buttons);
  popup.hide(); // Hide the new popup until it is finished and sized.

  if (width) {
    $popup.css('width', width);
  }

  // Schoology addition
  if(popup.extraClass instanceof Array)
    popup.extraClass = popup.extraClass[popup.extraClass.length-1];
  $popup.addClass(popup.extraClass);

  // Add the new popup to the DOM.
  $('body').append($popup);

  // Add button function callbacks.
  if (buttons) {
    jQuery.each(buttons, function(id, button){
      $('#' + id).click(button.func);
    });
  }

  // Add the default click-to-close behavior.
  popup.$popupClose().click(function(){
    return Popups.close(popup);
  });

  Popups.resizeAndCenter(popup);

  // Focus on the first input element in the popup window.
  popup.refocus();

  // TODO - this isn't the place for this - should mirror addLoading calls.
  // Remove the loading image.
  Popups.removeLoading();

  $(document).trigger('popups_open_done', [popup]);

  // Not all popups that are created through JS have an element attribute (protip: they should)
  // set the attribute so no JS errors are thrown
  popup.element = popup.element != null ? popup.element : $('body')[0];

  // Remember the element that opened the popup
  Drupal.sAccessibility.setLastFocus($(popup.element));

  // Hide the body from assistive technologies
  Drupal.sAccessibility.hideFromAT($('#body'));

  // Trap tab key to within the popup
  popup.trapTabKey();

  return popup;
};

/**
 * Adjust the popup's height to fit its content.
 * Move it to be centered on the screen.
 * This undoes the effects of popup.hide().
 *
 * @param popup
 */
Popups.resizeAndCenter = function(popup) {
  var $popup = popup.$popup();

  if(popup && popup.fullScreen){
    $popup.css({
      width: '100%',
      height: '100%',
      top: 0,
      left: 0
    });
    $('html').css('overflow', 'hidden');
    return;
  }
  // center on the screen, adding in offsets if the window has been scrolled
  var popupWidth = $popup.width();
  var windowWidth = Popups.windowWidth();

  // updated to use integer width: a floating point width can cause inconsistencies between browsers on determining the offsets of child elements
  var left = Math.floor((windowWidth / 2) - (popupWidth / 2) + Popups.scrollLeft());

  // Get popups's height on the page.
  $popup.css('height', 'auto'); // Reset height.
  var popupHeight = $popup.height();
  $popup.height(popupHeight);
  var windowHeight = Popups.windowHeight();

//  if (popupHeight > (0.9 * windowHeight) ) { // Must fit in 90% of window.
//    popupHeight = 0.9 * windowHeight;
//    $popup.height(popupHeight);
//  }
  var top = ((windowHeight / 2) - (popupHeight / 2))/2 + Popups.scrollTop();

  $popup.css('top', top).css('left', left); // Position the popups to be visible.
};


/**
 *  Create and show a simple popup dialog that functions like the browser's alert box.
 */
Popups.message = function(title, message) {
  message = message || '';
  var popup = new Popups.Popup();
  var buttons = {
    'popup_ok': {title: Drupal.t('OK'), func: function(){popup.close();}}
  };
  popup.open(title, message, buttons);
  return popup;
};

/**
 * Handle any special keys when popups is active.
 */
Popups.keyHandle = function(e) {
  if (!e) {
    e = window.event;
  }
  switch (e.keyCode) {
    case 27: // esc
      Popups.close();
      break;
    case 191: // '?' key, show help.
      if (e.shiftKey && e.ctrlKey) {
        var $help = $('a.popups.more-help');
        if ($help.size()) {
          $help.click();
        }
        else {
          Popups.message(Drupal.t("Sorry, there is no additional help for this page"));
        }
      }
      break;
  }
};

/*****************************************************************************
 * Appearence Functions (overlay, loading graphic, remove popups)     *********
 *****************************************************************************/

/**
 * Add full page div between the page and the dialog, to make the popup modal.
 */
Popups.addOverlay = function() {
  var $overlay = $('#popups-overlay');
  if (!$overlay.length) { // Overlay does not already exist, so create it.
    $overlay = $(Drupal.theme('popupOverlay'));
    $overlay.css('opacity', '0.4'); // for ie6(?)
    // Doing absolute positioning, so make overlay's size equal the entire body.
    var $doc = $(document);
    $overlay.width($doc.width()).height($doc.height());
    // If the theme is a fixed width theme, IE 6 and 7 will set the overlay to
    // be left aligned with the container div.
    if ($.browser.msie && ($.browser.version == '6.0' || $.browser.version == '7.0')) {
      $overlay.css('left', 0);
    }

    $('body').prepend($overlay);
  }
};

/**
 * Remove overlay if popupStack is empty.
 */
Popups.removeOverlay = function() {
  if (!Popups.popupStack.length) {
    $('#popups-overlay').remove();
  }
};

/**
 * Add a "Loading" message while we are waiting for the ajax response.
 */
Popups.addLoading = function() {
  var $loading = $('#popups-loading');
  if (!$loading.length) { // Loading image does not already exist, so create it.
    $loading = $(Drupal.theme('popupLoading'));
    $('body').prepend($loading); // Loading div is initially display:none.
    var width = $loading.width();
    var height = $loading.height();
    var left = (Popups.windowWidth() / 2) - (width / 2) + Popups.scrollLeft();
    var top = ((Popups.windowHeight() / 2) - (height / 2))/2 + Popups.scrollTop();

    $loading.css({'top': top, 'left': left, 'display': 'block'}); // Center it and make it visible.
  }
};

Popups.removeLoading = function() {
  $('#popups-loading').remove();
};

// Should I fold this function into Popups.pop?
Popups.removePopup = function(popup) {
  if (!Popups.isset(popup)) {
    popup = Popups.activePopup();
  }
  if (popup) {
    $(document).trigger('popups_before_remove', [popup]);
    popup.$popup().detach();
    Popups.popupStack.splice(jQuery.inArray(popup,Popups.popupStack), 1); // Remove popup from stack.  Probably should rework into .pop()
  }
};

/**
 * Remove everything.
 */
Popups.close = function(popup) {
  if (!Popups.isset(popup)) {
    popup = Popups.activePopup();
  }


  $(document).trigger('popups_before_close', [popup]);
  var nextActivePopup = false;

  Popups.removePopup(popup);  // Should this be a pop??
  Popups.removeLoading();
  if (Popups.activePopup()) {
    nextActivePopup = Popups.activePopup();
    nextActivePopup.show();
    nextActivePopup.refocus();
    Drupal.settings = Popups.originalSettingsStack[nextActivePopup.id];
  }
  else {
    Popups.removeOverlay();
    Popups.restorePage();

    if(popup && popup.fullScreen){
      $('html').css('overflow', 'auto');
    }
  }

  $(document).trigger('popups_close', [popup,nextActivePopup]);

  // if there aren't any other opened popups, reveal the main content to screen readers
  if(Popups.activePopup() == null) {
    Drupal.sAccessibility.revealToAT($('#body'));
  }

  // Return focus to the element that opened the popup
  Drupal.sAccessibility.returnFocus();

  return false;
};

/**
 * Save the page's original Drupal.settings.
 */
Popups.saveSettings = function() {
  if (!Popups.originalSettings) {
    Popups.originalSettings = Drupal.settings;
  }

  // handle restoring settings for popups within popups
  var popup = Popups.activePopup();
  if(popup && typeof Popups.originalSettingsStack[popup.id] == 'undefined'){
    Popups.originalSettingsStack[popup.id] = Drupal.settings;
  }
};

/**
 * Restore the page's original Drupal.settings.
 */
Popups.restoreSettings = function() {
  Drupal.settings = Popups.originalSettings;
};

/**
 * Remove as much of the effects of jit loading as possible.
 */
Popups.restorePage = function() {
  Popups.restoreSettings();
  // Remove the CSS files that were jit loaded for popup.
  for (var i in Popups.addedCSS) {
    var link = Popups.addedCSS[i];
    $('style[popups_src="'+ jqSelector($(link).attr('href')) + '"]').remove();
  }
  Popups.addedCSS = [];
};


/****************************************************************************
 * Utility Functions   ******************************************************
 ****************************************************************************/

/**
 * Get the position of the left side of the browser window.
 */
Popups.scrollLeft = function() {
  return Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
};

/**
 * Get the position of the top of the browser window.
 */
Popups.scrollTop = function() {
  return Math.max(document.documentElement.scrollTop, document.body.scrollTop);
};

/**
 * Get the height of the browser window.
 * Fixes jQuery & Opera bug - http://drupal.org/node/366093
 */
Popups.windowHeight = function() {
  if ($.browser.opera && $.browser.version > "9.5" && $.fn.jquery <= "1.2.6") {
    return document.documentElement.clientHeight;
  }
  return $(window).height();
};

/**
 * Get the height of the browser window.
 * Fixes jQuery & Opera bug - http://drupal.org/node/366093
 */
Popups.windowWidth = function() {
  if ($.browser.opera && $.browser.version > "9.5" && $.fn.jquery <= "1.2.6") {
    return document.documentElement.clientWidth;
  }
  return $(window).width();
};

Popups.nextCounter = function() {
  if (this.counter === undefined) {
    this.counter = 0;
  }
  else {
    this.counter++;
  }
  return this.counter;
};

/****************************************************************************
 * Ajax Functions   ******************************************************
 ****************************************************************************/

/**
 * Add additional CSS to the page.
 */
Popups.addCSS = function(css) {
  Popups.addedCSS = [];

  if(Drupal.settings.aggregated_css)
    var aggregatedCSS = Drupal.settings.aggregated_css;
  else
    var aggregatedCSS = [];

  for (var type in css) {
    for (var file in css[type]) {
      var link = css[type][file];
      // Does the page already contain this stylesheet?
      var src = $(link).attr('href');
      var srcOrig = $(link).attr('href_orig');
      var head = $('head');
      var preloadedCSS = jQuery.inArray(srcOrig, aggregatedCSS) != -1;
      if (!$('link[href="'+ jqSelector(srcOrig) + '"]').length && !preloadedCSS) {
        // Get the css from the server and add it.
        $.ajax({
          type: 'GET',
          url: src,
          async : false,
          success: function(css) {
            head.append('<style popups_src="' + src + '">' + css + '</style>');
          }
        });
        Popups.addedCSS.push(link); // Keep a list, so we can remove them later.
      }
    }
  }
};

/**
 * Add additional Javascript to the page.
 *
 * SGY-6382 - Fixed issue with browser running eval in the local scope
 * so defining global variables will not be actually defined in the global scope
 */
Popups.addJS = function(js) {
  // Parse the json info about the new context.
  var scripts = [];
  var inlines = [];
  for (var type in js) {
    if (type != 'setting') {
      for (var file in js[type]) {
        if (type == 'inline') {
          inlines.push($(js[type][file]).html());
        }
        else {
          var script = $(js[type][file]).attr('src');
          var src_orig = $(js[type][file]).attr('src_orig');
          scripts.push([script, src_orig]);
        }
      }
    }
  }

  // Add new JS settings to the page, needed for #ahah properties to work.

  var aggregatedCSS = Drupal.settings.aggregated_css;

  var aggregatedJS = []
  if(Drupal.settings.aggregated_js){
    jQuery.each(Drupal.settings.aggregated_js, function(k,v){
      // remove the cache-managing query string
      aggregatedJS.push(v.split('?')[0]);
    });
  }

  Drupal.settings = js.setting;
  Drupal.settings.aggregated_js = aggregatedJS;
  Drupal.settings.aggregated_css = aggregatedCSS;

  for (var i in scripts) {
    var script = scripts[i];
    var src = script[0];
    var srcOrig = script[1];
    // remove the cache-managing query string
    var checkSrc = srcOrig.split('?')[0];
    var preloadedJS = jQuery.inArray(checkSrc, aggregatedJS) != -1;
    if (!$('script[src="'+ jqSelector(srcOrig) + '"]').length && !preloadedJS && !Popups.addedJS[srcOrig]) {
      // Get the script from the server and execute it.
      $.ajax({
        type: 'GET',
        url: src,
        async : false,
        success: function(script) {
          eval.apply(window, [script]);
        }
      });
      // Mark the js as added to the underlying page.
      Popups.addedJS[srcOrig] = true;
    }
  }

  return inlines;
};

/**
 * Determines if the passed `content` matches an inline script
 * @param {String} content
 * @return {Boolean}
 */
Popups._inlineScriptExists = function(content) {
  return !!($('script:not([src])')
    .filter(function (i, script) {
      return script.innerHTML === content;
    })
    .length);
};

/**
 * Execute the jit loaded inline scripts.
 * Q: Do we want to re-excute the ones already in the page?
 *
 * @param inlines
 *   Array of inline scripts.
 */
Popups.addInlineJS = function(inlines) {
  // Load the inlines into the page.
  for (var n in inlines) {
    // If the script is not already in the page, execute it.
    if (!Popups._inlineScriptExists(inlines[n])) {
      eval(inlines[n]);
    }
  }
};

Popups.beforeSend = function(xhr) {
  // After JQuery 1.5, it's more reliable to use the headers property of the ajax options
  // to set additional headers. This function is left in but disabled for clarity.
  //xhr.setRequestHeader("X-Drupal-Render-Mode", 'json/popups');
  //xhr.setRequestHeader("Cache-Control", 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
};

/**
 * Do before the form in the popups is submitted.
 */
Popups.beforeSubmit = function(formData, $form, options) {
  $(document).trigger('popups_before_submit', [formData,$form,options] );
  Popups.removePopup(); // Remove just the dialog, but not the overlay.
  Popups.addLoading();
};

Popups.beforeSerialize = function($form , options ) {
  $(document).trigger('popups_before_serialize', [$form] );

  // Set a flag in the POST data idenfitying this request as having been generated from a popup
  // Note: This is a workaround for an IE bug that prevents custom headers from being set properly when you are sending a POST request
  $form.append('<input type="hidden" name="form_origin_popups" id="form_origin_popups" value="1" />');
};



/****************************************************************************
 * Page & Form in popups functions                                         ***
 ****************************************************************************/

/**
 * Use Ajax to open a link in a popups window.
 *
 * @param element
 *   Element that was clicked to open the popups.
 * @param options
 *   Hash of options controlling how the popups interacts with the underlying page.
 * @param parent
 *   If path is being opened from inside another popup, that popup is the parent.
 */
Popups.openPath = function(element, options, parent) {
  Popups.saveSettings();

  // Let the user know something is happening.
  if(!options.disableCursorMod)
    $('body').css("cursor", "wait");

  // TODO - get nonmodal working.
  if (!options.nonModal) {
    Popups.addOverlay();
  }
  Popups.addLoading();

  var href = options.href ? options.href : element.href;
  $(document).trigger('popups_open_path', [element, href]); // Broadcast Popup Open Path event.

  var params = {};
  // Force the popups to return back to the orignal page when forms are done, unless hijackDestination option is set to FALSE.
  if (options.hijackDestination) {
    var returnPath;
    if (parent) {
      returnPath = parent.path;
    }
    else { // No parent, so bring flow back to original page.
      returnPath = Popups.originalSettings.popups.originalPath;
    }
    href = href.replace(/destination=[^;&]*[;&]?/, ''); // Strip out any existing destination param.

    params.destination = returnPath; // Set the destination to return to the parent's path.

    // Sometimes when there is a reload we do not want some of our server side logging happening.  Tack on a query parameter if this option is set
    if(options.disableRedirectLogging && params.destination.indexOf('pdrl=1') == -1){
      params.destination = params.destination + ($.inArray('?', params.destination) == -1 ? '?' : '&') + 'pdrl=1';
      // Change the parent path so donetest works
      if(parent){
        parent.path = params.destination;
      }
      else{
        Popups.originalSettings.popups.originalPath = params.destination;
      }
    }
  }

  var ajaxOptions = {
    url: href,
    dataType: 'text',
    data: params,
    headers: Popups.ajaxHeaders,
    beforeSend: Popups.beforeSend,
    success: function( data , status , xhr ) {
      var json = $.parseJSON( data );
      // Add additional CSS to the page.
      Popups.addCSS(json.css);
      var inlines = Popups.addJS(json.js);
      var path = json.path + (json.path_query ? '?' + json.path_query : '');
      // normalize single key flags (get rid of equal sign in ?theme_debug=
      path = path.replace(/=(&)|=$/, '$1');
      var popup = Popups.openPathContent(path, json.title, json.messages + json.content, element, options, parent);
      Popups.addInlineJS(inlines);
      // Broadcast an event that the path was opened.
      $(document).trigger('popups_open_path_done', [element, href, popup]);
    },
    complete: function() {
      $('body').css("cursor", "auto"); // Return the cursor to normal state.
    }
  };

  var ajaxOptions;
  if (options.reloadOnError) {
    ajaxOptions.error = function() {
      location.reload(); // Reload on error. Is this working?
    };
  }
  else {
    ajaxOptions.error = function(jqXHR, textStatus, errorThrown) {
      Popups.errorMessage(jqXHR, textStatus, errorThrown, this.url);
    };
  }
  $.ajax(ajaxOptions);

  return false;
};

/**
 * Open path's content in an ajax popups.
 *
 * @param title
 *   String title of the popups.
 * @param content
 *   HTML to show in the popups.
 * @param element
 *   A DOM object containing the element that was clicked to initiate the popup.
 * @param options
 *   Hash of options controlling how the popups interacts with the underlying page.
 * @param parent
 *   Spawning popup, or null if spawned from original page.
 */
Popups.openPathContent = function(path, title, content, element, options, parent) {
  var popup = new Popups.Popup();
  // Schoology modification: allow a 'class' attribute for popups settings
  popup.extraClass = options.extraClass;
  popup.fullScreen = options.fullScreen;
  popup.disableInputFocus = options.disableInputFocus;

  // Set properties on new popup.
  popup.parent = parent;
  popup.path = path;
  popup.options = options;
  popup.element = element;

  Popups.open(popup, title, content, null, options.width);

  // Add behaviors to content in popups.
  delete Drupal.behaviors.tableHeader; // Work-around for bug in tableheader.js (http://drupal.org/node/234377)
  delete Drupal.behaviors.teaser; // Work-around for bug in teaser.js (sigh).
  if(!options.disableAttachBehaviors)
    Drupal.attachBehaviors(popup.$popupBody());
  // Adding collapse moves focus.
  popup.refocus();

  // If the popups contains a form, capture submits.
  var $form = $('form', popup.$popupBody());

  if ($form.length && options.ajaxForm) {
    $form.ajaxForm({
      iframe: false,
      dataType: 'text',
      beforeSubmit: Popups.beforeSubmit,
      beforeSerialize: Popups.beforeSerialize,
      headers: Popups.ajaxHeaders,
      beforeSend: Popups.beforeSend,
      success: function( data, status, xhr ) {
        var json = $.parseJSON( data );
        Popups.formSuccess(popup, json);
      },
      error: function(jqXHR, textStatus, errorThrown) {
        Popups.errorMessage(jqXHR, textStatus, errorThrown, this.url, this.data);
      }
    });
  }
  else if( typeof options.formOnSubmit == 'function')
  {
    $form.submit(function(){
        var cf = options.formOnSubmit();
        return cf;
      });
  }

  return popup;
};

/**
 * The form in the popups was successfully submitted
 * Update the originating page.
 * Show any messages in a popups.
 *
 * @param popup
 *   The popup object that contained the form that was just submitted.
 * @param data
 *   JSON object from server with status of form submission.
 */
Popups.formSuccess = function(popup, data) {
  // Determine if we are at an end point, or just moving from one popups to another.
  var done = popup.isDone(data.path + (data.path_query ? '?' + data.path_query : ''));

  if (!done) { // Not done yet, so show new page in new popups.
    Popups.addCSS(data.css);
    var inlines = Popups.addJS(data.js);
    Popups.removeLoading();
    var updatedPopup = Popups.openPathContent(data.path, data.title, data.messages + data.content, popup.element, popup.options, popup.parent);
    $(document).trigger('popups_form_success_notdone', [updatedPopup,data]);
    Popups.addInlineJS(inlines);
  }
  else { // We are done with popup flow.
    // Execute the onUpdate callback if available.
    if (popup.options.updateMethod === 'callback' && popup.options.onUpdate) {
      if(typeof popup.options.onUpdate == 'function'){
        var result = popup.options.onUpdate.call(this, data, popup.options, popup.element);
      }
      else{
        var result = eval(popup.options.onUpdate +'(data, popup.options, popup.element)');
      }
      if (result === false) { // Give onUpdate callback a chance to skip normal processing.
        return;
      }
    }

    if (popup.options.updateMethod === 'reload') { // Force a complete, non-ajax reload of the page.
      if (popup.options.updateSource === 'final') {
        location.href = Drupal.settings.basePath + data.path + (data.path_query ? '?' + data.path_query : ''); // TODO: Need to test this.
      }
      else { // Reload originating page.
        location.reload();
      }
    }
    else { // Normal, targeted ajax, reload behavior.
      // Show messages in dialog and embed the results in the original page.
      var showMessage = data.messages && data.messages.length && !popup.options.noMessage;
      if (showMessage) {
        // Insert the message into the page above the content.
        // Might not be the standard spot, but it is the easiest to find.
        var $next;
        var attachContext;
        if (popup.targetLayerSelector() === 'body') {
          $next = $('body').find(Popups.originalSettings.popups.defaultTargetSelector);
          $next.parents('#main-content-wrapper').find('div.popup-messages-wrapper, div.messages').remove(); // Remove the existing messages.
          $next.before('<div class="popup-messages-wrapper">' + data.messages + '</div>'); // Insert new messages.
          attachContext = $('div.popup-messages-wrapper');
        }
        else {
          $next = $(popup.targetLayerSelector()).find('.popups-body');
          $next.parents('#main-content-wrapper').find('div.messages').remove(); // Remove the existing messages.
          $next.prepend(data.messages); // Insert new messages.
          attachContext = $next;
        }

        Drupal.attachBehaviors(attachContext);
      }

      // Update the content area (defined by 'targetSelectors').
      if (popup.options.updateMethod !== 'none') {
        Popups.testContentSelector(); // Kick up warning message if selector is bad.

        Popups.restoreSettings(); // Need to restore original Drupal.settings.popups.links before running attachBehaviors.  This probably has CSS side effects!
        if (popup.options.targetSelectors) { // Pick and choose what returned content goes where.
          jQuery.each(popup.options.targetSelectors, function(t_new, t_old) {
            if(!isNaN(t_new)) {
              t_new = t_old; // handle case where targetSelectors is an array, not a hash.
            }
            var new_content = $(t_new, data.content);
            if(new_content.length == 0 && Popups.isset(data.content_top))
              new_content = $(t_new, data.content_top);
            if(new_content.length == 0 && Popups.isset(data.content_right))
                new_content = $(t_new, data.content_right);
            if(new_content.length == 0 && Popups.isset(data.content_left))
                new_content = $(t_new, data.content_left);
            if(new_content.length == 0 && Popups.isset(data.content_left_top))
                new_content = $(t_new, data.content_left_top);
            if(new_content.length == 0 && Popups.isset(data.content_top_upper))
            	new_content = $(t_new, data.content_top_upper);
            var $c = $(popup.targetLayerSelector()).find(t_old).html(new_content.html()); // Inject the new content into the original page.

            Drupal.attachBehaviors($c);
          });
        }
        else { // Put the entire new content into default content area.
          var $c = $(popup.targetLayerSelector()).find(Popups.originalSettings.popups.defaultTargetSelector).html(data.content);
          Drupal.attachBehaviors($c);
        }
      }

      // Update the title of the page.
      if (popup.options.titleSelectors) {
        jQuery.each(popup.options.titleSelectors, function() {
          $(''+this).html(data.title);
        });
      }

      // Done with changes to the original page, remove effects.
      Popups.removeLoading();
      if (!popup.options.forceShowNextActivePopup && !showMessage) {
        // If there is not a messages popups, close current layer.
        Popups.close();
      }
      //   since the popup was removed in the beforeSubmit, just show the next active popup
      else if (Popups.activePopup()) {
        nextActivePopup = Popups.activePopup();
        nextActivePopup.show();
        nextActivePopup.refocus();
        Drupal.settings = Popups.originalSettingsStack[nextActivePopup.id];
      }
      else {
        Popups.removeOverlay();
        Popups.restorePage();

        if(popup && popup.fullScreen){
          $('html').css('overflow', 'auto');
        }
      }
    }

    // Broadcast an event that popup form was done and successful.
    $(document).trigger('popups_form_success', [popup,data]);

  }  // End of updating spawning layer.
};


/**
 * Get a jQuery object for the content of a layer.
 * @param layer
 *   Either a popup, or null to signify the original page.
 */
Popups.getLayerContext = function(layer) {
  var $context;
  if (!layer) {
    $context = $('body').find(Popups.originalSettings.popups.defaultTargetSelector);
  }
  else {
    $context = layer.$popupBody();
  }
  return $context;
}

/**
 * Submit the page and reload the results, before popping up the real dialog.
 *
 * @param element
 *   Element that was clicked to open a new popup.
 * @param options
 *   Hash of options controlling how the popups interacts with the underlying page.
 * @param layer
 *   Popup with form to save, or null if form is on original page.
 */
Popups.saveFormOnLayer = function(element, options, layer) {
  var $context = Popups.getLayerContext(layer);
  var $form = $context.find('form');
  var ajaxOptions = {
    iframe: false,
    dataType: 'text',
    beforeSubmit: Popups.beforeSubmit,
    beforeSerialize: Popups.beforeSerialize,
    headers: Popups.ajaxHeaders,
    beforeSend: Popups.beforeSend,
    success: function(data, status, xhr) {
      var response = $.parseJSON( data );
      // Sync up the current page contents with the submit.
      var $c = $context.html(response.content); // Inject the new content into the page.
      Drupal.attachBehaviors($c);
      // The form has been saved, the page reloaded, now safe to show the triggering link in a popup.
      Popups.openPath(element, options, layer);
    }
  };
  $form.ajaxSubmit(ajaxOptions); // Submit the form.
};

/**
 * Warn the user if ajax updates will not work
 *   due to mismatch between the theme and the theme's popup setting.
 */
Popups.testContentSelector = function() {
  var target = Popups.originalSettings.popups.defaultTargetSelector;
  var hits = $(target).length;
  if (hits !== 1) { // 1 is the corrent answer.
    var msg = Drupal.t('The popup content area for this theme is misconfigured.') + '\n';
    if (hits === 0) {
      msg += Drupal.t('There is no element that matches ') + '"' + target + '"\n';
    }
    else if (hits > 1) {
      msg += Drupal.t('There are multiple elements that match: ') + '"' + target + '"\n';
    }
    msg += Drupal.t('Go to admin/build/themes/settings, select your theme, and edit the "Content Selector" field');
    alert(msg);
  }
};

Popups.errorMessage = function(jqXHR, textStatus, errorThrown, url, data) {
  var supportUrl = 'https://support.schoology.com/hc/en-us/requests/new',
      supportLinkText = Drupal.t('New Support Request'),
      supportLink = '<a href="' + supportUrl + '">' + supportLinkText + '</a>';

  Popups.message(
    Drupal.t('Unexpected Error'),
    '<p>' + Drupal.t('Please try again in a few minutes') + '</p>' +
    '<p class="description">' + Drupal.t('If after trying a few times you continue to see this message, please contact the Support Team') + '</p>' +
    '<p>' + supportLink + '</p>'
  );

  // log the error
  $.post('/popups_error', {
    'popups_error': textStatus,
    'popups_url': url,
    'popups_data': data,
    'popups_status': jqXHR.status,
    'popups_response': jqXHR.status < 300 ? jqXHR.responseText: '',
    'error_type' : 'popups'
  });
}

// ****************************************************************************
// * Theme Functions   ********************************************************
// ****************************************************************************

Drupal.theme.prototype.popupLoading = function() {
  var loading = '<div id="popups-loading">';
  loading += '<img src="'+ Drupal.settings.basePath + Popups.originalSettings.popups.modulePath + '/ajax-loader.gif" />';
  loading += '</div>';
  return loading;
};

Drupal.theme.prototype.popupOverlay = function() {
  return '<div id="popups-overlay"></div>';
};

Drupal.theme.prototype.popupButton = function(title, id) {
  return '<input type="button" value="'+ title +'" id="'+ id +'" />';
};

Drupal.theme.prototype.popupDialog = function(popupId, title, body, buttons) {
  var template = Drupal.theme('popupTemplate', popupId);
  var popups = template.replace('%title', title).replace('%body', body);

  var themedButtons = '';
  if (buttons) {
    jQuery.each(buttons, function (id, button) {
      themedButtons += Drupal.theme('popupButton', button.title, id);
    });
  }
  popups = popups.replace('%buttons', themedButtons);
  return popups;
};

Drupal.theme.prototype.popupTemplate = function(popupId) {
  var template = '';
  template += '<div id="'+ popupId + '" class="popups-box">';
  template += '  <div class="popups-title">';
  template += '    <div class="popups-close"><a href="#">' + Drupal.t('Close') + '</a></div>';
  template += '    <div class="title">%title</div>';
  template += '    <div class="clear-block"></div>';
  template += '  </div>';
  template += '  <div class="popups-body">%body</div>';
  template += '  <div class="popups-buttons">%buttons</div>';
  template += '  <div class="popups-footer"></div>';
  template += '</div>';
  return template;
};
;Drupal.theme.prototype.popupTemplate = function(popupId) {
  var template = '';
  template += '<div id="'+ popupId + '" class="popups-box" role="dialog">';
  template += '  <div class="popups-title">';
  template += '    <div class="popups-close"><a href="javascript://"><span class="visually-hidden">' + Drupal.t('Close') + '</span></a></div>';
  template += '    <div class="title">%title</div>';
  template += '    <div class="clear-block"></div>';
  template += '  </div>';
  template += '  <div class="popups-body" tabindex="0">%body</div>';
  template += '  <div class="popups-buttons tabindex="0">%buttons</div>';
  template += '  <div class="popups-footer"></div>';
  template += '</div>';
  return template;
};
;/*
 * sioscompat v1.0
 * schoology minimal custom compatibilty for mobile webkit browsers
 */

(function($){
  $.fn.sioscompat = function(options) {

    var opts = $.extend( {}, $.fn.sioscompat.defaults, options);

    // device detection via user agent
    var device_agent = navigator.userAgent.toLowerCase();
    var id_match = device_agent.match(/(iphone|ipod|ipad)/);

    if (!id_match && !opts.override)
      return;


    /// date module date popup compat
    $(this).not('.sios-enabled)').addClass('sios-enabled').each(function(){

      var base_obj = $(this);
      var time_inputs = [];

      if( Drupal.settings.datePopup && typeof Drupal.settings.datePopup == 'object') {
        // replace time-select inputs with the 'time' input
        $.each( Drupal.settings.datePopup , function( index , val ){
          if( typeof val == 'object' && val.func && val.func == 'timeEntry' ) {
           Drupal.settings.datePopup[ index ].func = null;
           time_inputs.push( replaceTimeInput( $('#'+String(index),base_obj) ) );
          }
        });
      }

      if( time_inputs.length > 0 ) {
        var invalid_inputs = [];
        time_inputs[0].parents('form').submit(function(){
          $.each( time_inputs , function( index , obj ){
            var time_val = obj.val();
            if(time_val == '')
              return;

            time_val = time_val.toUpperCase().trim();
            time_val = time_val.replace(/[^0-9APMapm:]+/g,'');

            if( time_val.match(/^[0-9]{1,2}:[0-9]{2}$/) ){
              // convert from military time
              var time_parts = time_val.split(":");

              var hour = Number(time_parts[0]);
              if( hour > 12 ){
                time_parts.push('PM');
                time_parts[0] = String(hour - 12);
              } else if( hour < 12 ) {
                time_parts.push('AM');

                if( hour == 0 )
                  time_parts[0] = "12";
              } else {
                time_parts.push('PM');
              }

              time_val = time_parts[0] + ':' + time_parts[1];
              if( time_parts.length > 2 )
                time_val += time_parts[2];
            }

            obj.val(time_val);

            if(!time_val.match(/[0-9]{1,2}:[0-9]{2}AM|PM/))
              invalid_inputs.push( obj );
          });
        });
      }
    });



    function replaceTimeInput( base_input  ) {

      // html 5 time input
      var time_input = $('<input type="time" />');
      time_input.attr({'id': base_input.attr('id') , 'name': base_input.attr('name') , 'class': base_input.attr('class') , 'maxlength': base_input.attr('maxlength') } );

      // infotip
      var cluetip_content = Drupal.t('Please enter the time in this format: HH:MM am/pm');
      var infotip_obj = $('<span class="infotip ipad-time" tipsygravity="sw"><span class="infotip-content">' + cluetip_content + '</span></span>');

      base_input.replaceWith( time_input );
      time_input.after( infotip_obj );

      // infotip functionality
      sAttachBehavior( 'sCommonInfotip' , time_input.parent() );

      return time_input;
    }

  }

  // plug-in defaults
  $.fn.sioscompat.defaults = {
   'override' : false // override device detection and run the plugin anyways
  };
})(jQuery)
;Drupal.behaviors.sHome = function(context){

  $('#smart-box:not(.sHome-processed)' , context ).addClass('sHome-processed').each(function(){
    var smartBoxObj = $(this);
    var _s_home_smartbox_tab_clicked = false;

    // Handle cancel buttons and clicking on 'active' button
    smartBoxObj.bind('click', function(e){
      var wrapper = $(this);
      var contentWrapper = $("#smart-box-content", wrapper);
      var target = $(e.target);
      if(target.attr('id') == 'edit-cancel' || target.parents('#edit-cancel').length > 0){
        sHomeResetSmartBox();
        return false;
      }
    });

    $('#smart-box-more-wrapper' , smartBoxObj ).sActionLinks({hidden: false, wrapper: '.action-links-wrapper'});

    $('.filter-block li', smartBoxObj).removeClass('active');
    $('.filter-block li span', smartBoxObj).removeClass('active');
    $('#smart-box-content' , smartBoxObj).children().not(':nth-child(1)').hide();

    $('.filter-block li .smartbox-boxtab', smartBoxObj ).click(function(e){
      if(_s_home_smartbox_tab_clicked)
        return true;
      e.preventDefault();

      $(this).sActionLinks({hide_all: true});

      var links = $(this).parents('.filter-block');
      var currSelectedIndex = links.data('selected');

      if(currSelectedIndex == undefined)
        currSelectedIndex = -1;

	    var tab_id = $(this).attr('id').replace(/[^0-9]/gi,'');
      var newIndex = parseInt(tab_id);

      sHomeResetSwfu();

      // if selecting a new tab
      if(newIndex != currSelectedIndex) {
         links.data('selected', newIndex);

        // remove active class from the old link and hide its associated content
        links.children().eq(currSelectedIndex).removeClass('active');
        $('#smart-box-tab-content-' + String(currSelectedIndex)).empty().hide();

        // add the 'active' class to the new link and show assoc. content
        var newContainer = $('#smart-box-tab-content-' + String(newIndex));
        newContainer.html('<div id="smart-box-loader"><span class="throbber"></span></div>').show();

        links.children().eq(newIndex).addClass('active').data('selected', newIndex);

        _s_home_smartbox_tab_clicked = true;

        var tab_exclude = Drupal.settings.s_smart_box && Drupal.settings.s_smart_box.exclude ? Drupal.settings.s_smart_box.exclude : '';

        $.ajax({
          url: '/home/tabsjs/' + String(newIndex) + '/' + String(tab_exclude),
          dataType: 'json',
          type: 'GET',
          success: function(response, status){
            newContainer.hide().empty().prepend(response.data);
            links.children().not('.active').addClass('inactive');
          },
          error: function(response, status){
            newContainer.hide().empty().prepend('<div class="messages error">' + Drupal.t('There was an error loading this tab.  Please check your connection and try again.') + '</div>');
          },
          complete: function(response, status){
            newContainer.fadeIn('fast');
            _s_home_smartbox_tab_clicked = false;
            Drupal.attachBehaviors(newContainer);
          }
        });
      }
      else {
        sHomeResetSmartBox();
      }
    });
  });

  $('#smart-box textarea:not(.sHome-processed)' , context ).addClass('sHome-processed').each(function(){
    $(this).elastic();
  });

  // Right Column
  $('#right-column:not(.sHome-processed)' , context ).addClass('sHome-processed').each(function(){
    var rightColumnObj = $(this);

    getCourseReminders(rightColumnObj, 0);

	  var overdueSubmissionsWrapper = $('.overdue-submissions' , rightColumnObj );
	  if( overdueSubmissionsWrapper.length > 0 ) {
		  $.ajax({
			  url: '/home/overdue_submissions_ajax',
			  dataType: 'json',
			  type: 'GET',
			  success: function(response, status){
				  overdueSubmissionsWrapper.empty();
				  overdueSubmissionsWrapper.append($(response.html).children());
				  Drupal.attachBehaviors(overdueSubmissionsWrapper);
			  }
		  });
	  }

    var upcomingWrapper = $('.upcoming-events' , rightColumnObj );
    if( upcomingWrapper.length > 0 ) {
      $.ajax({
        url: '/home/upcoming_ajax',
        dataType: 'json',
        type: 'GET',
        success: function(response, status){
          upcomingWrapper.empty();
          upcomingWrapper.append($(response.html).children());
          Drupal.attachBehaviors(upcomingWrapper);
       }
      });
    }

    $('.suggested-users-wrapper' , rightColumnObj ).each(function(){
      var suggestBlock = $(this);
      $(document).bind('suggestionsBlockReady', function(e, data){
        suggestBlock.empty();
        suggestBlock.append(data);
        sCommonAjaxNetworkConnectBehavior(suggestBlock, sCommonDefaultConnectStatusResponseMap());
        Drupal.attachBehaviors($('.suggested-users-wrapper'));
      });
      sCommonGetSuggestionBlock('suggestions');
    });

    $('.suggested-groups-wrapper' , rightColumnObj ).each(function(){
      var suggestBlock = $(this);
      $(document).bind('groupsBlockReady', function(e, data){
        suggestBlock.empty();
        suggestBlock.append(data);
        Drupal.attachBehaviors($('.suggested-groups-wrapper'));
        sCommonAjaxEnrollmentBehavior($('.suggested-groups-wrapper'));
      });
      sCommonGetSuggestionBlock('groups');
    });

    $('.suggested-apps-wrapper' , rightColumnObj ).each(function(){
      var suggestBlock = $(this);
      $(document).bind('appsBlockReady', function(e, data){
        suggestBlock.empty();
        suggestBlock.append(data);
        Drupal.attachBehaviors($('.suggested-apps-wrapper'));
      });
      sCommonGetSuggestionBlock('apps');
    });

  });

  $('.profile-picture-wrapper.own-picture:not(.sHome-processed)', context).addClass('sHome-processed').each(function(){
          var wrapper = $(this);
          var pic = $('.profile-picture', wrapper);
          pic.bind('s_profile_picture_uploaded', function(e, path){
	      	$('img', $(this)).attr('src', path).removeAttr('height');

	  });
  });
}

/**
 * Used to fetch and attach the course reminders block (ungraded submissiones, resubmissions, etc) to the home page
 * @param (jQuery object) rightColumnObj
 * @param int retry - the number of times that has been retried
 */
function getCourseReminders(rightColumnObj, retry){
    $.ajax({
        url: '/home/course_reminders_ajax?retry=' + retry,
        dataType: 'json',
        type: 'GET',
        success: function(response, status){
            if(response.retry_in){
                //after the specified retry time, retry getting the course reminders
                setTimeout(function(){getCourseReminders(rightColumnObj, retry + 1)}, response.retry_in);
            }else if(response.html){
                $('#right-column-inner', rightColumnObj).prepend($(response.html).children());
                var remindersWrapper =  $('.reminders-wrapper', rightColumnObj);
                Drupal.attachBehaviors(remindersWrapper);
                sCourseSetupTodoList(remindersWrapper);
            }
        }
    });
}


function unloadSmartBoxRichtext(context){
  var editorId = tinyMCE && tinyMCE.activeEditor ? tinyMCE.activeEditor.editorId : null;
  if(editorId){
    var editorObj = $('#' + editorId, context);
    if(editorObj.length){
      tinyMCE.execCommand('mceRemoveControl', false, editorId);
    }
  }
}

function sHomeResetSmartBox() {
  var smartboxObj = $('#smart-box');
  unloadSmartBoxRichtext(smartboxObj);
  sHomeResetSwfu();
  $('#smart-box-content .smart-box-tab-content', smartboxObj).empty().hide();
  var filterBlock = $("#smart-box .filter-block");
  $("li", filterBlock).removeClass('active').removeClass('inactive');
  filterBlock.data('selected', -1);
}

function sHomeResetSwfu(){
  // In IE8 if you do not properly destroy swfu, the external interface complains alot
  if( typeof swfu != 'object' || !swfu.movieName )
    return;

  if( $('#'+swfu.movieName).parents('#smart-box').length == 0 )
    return;

  try{
    swfu.destroy();
  } catch(e){ };
};Drupal.behaviors.sCommonAdvancedOptions = function(context){
  // advanced option section
  $('.s-common-adv-options-wrapper:not(.sCourseMaterials-process)', context).addClass('sCourseMaterials-process').each(function(){
    var wrapperObj = $(this),
        formObj = wrapperObj.closest('form');
    sCommonAdvancedOptions.initForm(formObj);
    // copy-to-courses
    var copyToCourseBtn = $('.toggle-copy', wrapperObj);
    if(copyToCourseBtn.length){
      formObj.click(function(e) {
        // clicking somewhere on the form should close the copy to courses box
        var target = $(e.target);
        if(!target.is('#addl-courses') &&
          !target.is('.toggle-copy') &&
          target.closest('#addl-courses').length == 0 &&
          target.closest('.toggle-copy').length == 0 &&
          $('#addl-courses').is(':visible')){
          $('#addl-courses').hide();
        }
      });
      copyToCourseBtn.click(function(){
        if(!$(this).hasClass('disabled')){
          formObj.find('#addl-courses').toggle();
          sPopupsResizeCenter();
        }
      });
    }
  });
};

if(typeof window.sCommonAdvancedOptions == 'undefined'){
  window.sCommonAdvancedOptions = (function(){
    var obj = {
      callbacks: {}
    };

    /**
     * Initialize the advanced options in the form.
     *
     * @param object formObj
     */
    obj.initForm = function(formObj){
      var wrapperObj = formObj.find('.s-common-adv-options-wrapper'),
          formId = formObj.attr('id');
      if(wrapperObj.length){
        $('.adv-option-btn', wrapperObj).each(function(){
          var btnObj = $(this),
              isToggle = btnObj.hasClass('adv-option-toggle'),
              keyStr = btnObj.attr('key'),
              accessibleText = btnObj.find('.visually-hidden');

          // cluetips
          if(isToggle){
            // toggles will have a different cluetip text depending on the state
            var onTitle = btnObj.attr('on-title'),
                offTitle = btnObj.attr('off-title'),
                defaultTitle = btnObj.attr('title');
            if(!onTitle || !onTitle.length){
              onTitle = defaultTitle;
            }
            if(!offTitle || !offTitle.length){
              offTitle = defaultTitle;
            }
            accessibleText.text(btnObj.hasClass('adv-option-on') ? onTitle : offTitle);
            btnObj.tipsy({
              gravity: 's',
              title: function(){
                if(btnObj.hasClass('disabled') && btnObj.attr('disabled-title')){
                  return btnObj.attr('disabled-title');
                }
                else if(btnObj.hasClass('adv-option-on')){
                  return onTitle;
                }
                else{
                  return offTitle;
                }
              }
            });
          }
          else{
            sCommonAdvancedOptionsSetupToggleTipsy(btnObj);
          }

          btnObj.click(function(){
            if(isToggle && !btnObj.hasClass('adv-option-disabled')){

              // update the accessible text
              accessibleText.text(btnObj.hasClass('adv-option-on') ? offTitle : onTitle);

              // trigger mouseenter to allow the cluetip to change
              btnObj.toggleClass('adv-option-on').triggerHandler('mouseenter');
              if(keyStr && keyStr.length){
                // link the toggles into the checkbox field provided by the form API
                var cbObj = formObj.find('.adv-option-' + keyStr);
                cbObj.prop('checked', btnObj.hasClass('adv-option-on'));
              }
            }

            obj.fireEvent(formId, keyStr, [btnObj]);
          });
        });
      }
    };

    obj.clearEvents = function(formId){
      this.callbacks[formId] = {};
    };

    obj.fireEvent = function(formId, btnKey, args){
      if(typeof args == 'undefined'){
        var args = [];
      }
      if(typeof obj.callbacks[formId] != 'undefined' &&
         typeof obj.callbacks[formId][btnKey] != 'undefined'){
        $.each(obj.callbacks[formId][btnKey], function(k, func){
          func.apply(this, args);
        });
      }
    };

    obj.registerEvent = function(formId, btnKey, eventId, callback){
      if(typeof obj.callbacks[formId] == 'undefined'){
        obj.callbacks[formId] = {};
      }
      if(typeof obj.callbacks[formId][btnKey] == 'undefined'){
        obj.callbacks[formId][btnKey] = {};
      }
      obj.callbacks[formId][btnKey][eventId] = callback;
    };

    return obj;
  }());
}

function sCommonAdvancedOptionsSetupToggleTipsy(btnObj){
  btnObj.tipsy({
    gravity: 's',
    title: function(){
      return btnObj.hasClass('disabled') && btnObj.attr('disabled-title') ? btnObj.attr('disabled-title') : btnObj.attr('original-title');
    }
  });
};jQuery.fn.truncate = function( max, settings ) {
    settings = jQuery.extend( {
        chars: /\s/,
        trail: [ "...", "" ]
    }, settings );
    var myResults = {};
    var ie = $.browser.msie;
    function fixIE( o ) {
        if ( ie ) {
            o.style.removeAttribute( "filter" );
        }
    }
    return this.each( function() {
        var $this = jQuery(this);
        var myStrOrig = $this.html().replace( /\r\n/gim, "" );
        var myStr = myStrOrig;
        var myRegEx = /<\/?[^<>]*\/?>/gim;
        var myRegExArray;
        var myRegExHash = {};
        var myResultsKey = $("*").index( this );
        while ( ( myRegExArray = myRegEx.exec( myStr ) ) != null ) {
            myRegExHash[ myRegExArray.index ] = myRegExArray[ 0 ];
        }
        myStr = jQuery.trim( myStr.split( myRegEx ).join( "" ) );
        if ( myStr.length > max ) {
            var c;
            while ( max < myStr.length ) {
                c = myStr.charAt( max );
                if ( c.match( settings.chars ) ) {
                    myStr = myStr.substring( 0, max );
                    break;
                }
                max--;
            }
            if ( myStrOrig.search( myRegEx ) != -1 ) {
                var endCap = 0;
                for ( eachEl in myRegExHash ) {
                    myStr = [ myStr.substring( 0, eachEl ), myRegExHash[ eachEl ], myStr.substring( eachEl, myStr.length ) ].join( "" );
                    if ( eachEl < myStr.length ) {
                        endCap = myStr.length;
                    }
                }
                $this.html( [ myStr.substring( 0, endCap ), myStr.substring( endCap, myStr.length ).replace( /<(\w+)[^>]*>.*<\/\1>/gim, "" ).replace( /<(br|hr|img|input)[^<>]*\/?>/gim, "" ) ].join( "" ) );
            } else {
                $this.html( myStr );
            }
            myResults[ myResultsKey ] = myStrOrig;
            $this.html( [ "<div class='truncate_less'>", $this.html(), settings.trail[ 0 ], "</div>" ].join( "" ) )
            .find(".truncate_show",this).click( function() {
                if ( $this.find( ".truncate_more" ).length == 0 ) {
                    $this.append( [ "<div class='truncate_more' style='display: none;'>", myResults[ myResultsKey ], settings.trail[ 1 ], "</div>" ].join( "" ) )
                    .find( ".truncate_hide" ).click( function() {
                        $this.find( ".truncate_more" ).css( "background", "#fff" ).fadeOut( "normal", function() {
                            $this.find( ".truncate_less" ).css( "background", "#fff" ).fadeIn( "normal", function() {
                                fixIE( this );
                                $(this).css( "background", "none" );
                            });
                            fixIE( this );
                        });
                        return false;
                    });
                }
                $this.find( ".truncate_less" ).fadeOut( "normal", function() {
                    $this.find( ".truncate_more" ).fadeIn( "normal", function() {
                        fixIE( this );
                    });
                    fixIE( this );
                });
                jQuery(".truncate_show",$this).click( function() {
                    $this.find( ".truncate_less" ).css( "background", "#fff" ).fadeOut( "normal", function() {
                        $this.find( ".truncate_more" ).css( "background", "#fff" ).fadeIn( "normal", function() {
                            fixIE( this );
                            $(this).css( "background", "none" );
                        });
                        fixIE( this );
                    });
                    return false;
                });
                return false;
            });
        }
    });
};;Drupal.behaviors.sUpdate = function(context){
  $("#s-update-create-form:not(.sUpdate-processed), #s-update-create-combined-form:not(.sUpdate-processed)", context).addClass('sUpdate-processed').each(function(){
    var formObj = $(this);

    $("#toggle-copy", formObj).click(function(){
    	if($("div#attachment-links").length > 0){
        $("#attachment-file").hide();
        $("#attachment-link").hide();
        $("ul#attachment-selector li#link-selector").removeClass('active');
        $("ul#attachment-selector li#file-selector").removeClass('active');
      }

     if($("#toggle-copy").hasClass('active')){
        $('#copy-to-courses .form-checkboxes:first').hide();
        $("#toggle-copy").removeClass('active')
      }
      else {
        $('#copy-to-courses .form-checkboxes:first').show();
        $("#toggle-copy").addClass('active')
      }

      return false;
    });

    if (window.sTinymce) {
      sTinymce.checkInlineImgBeforeSubmit(context);
    }

  });

  $('.s-edge-type-update-post:not(.sUpdate-processed),.s-edge-type-update-post-parent:not(.sUpdate-processed),.s-edge-type-update-poll:not(.sUpdate-processed), .update-comments:not(.sUpdate-processed)', context).addClass('sUpdate-processed').each(function(){
    var updatePost = $(this);
    $('.s-comments-post-form' , updatePost ).each(function(){
      var commentFormObj = $(this);
      $('textarea', commentFormObj).each(function(){
        var textareaObj = $(this);
        textareaObj.removeClass('add-comment-resize');
      });
    });

     $('.show-more-link', updatePost).click(function(e){
       e.preventDefault();
    	 var linkObj = $(this);
    	 var isComment = linkObj.hasClass('comment-link');

    	 $.ajax({
    		 url : linkObj.attr('href'),
    		 method : 'post',
    		 dataType : 'json',
    		 success : function(data){
    		   if( isComment ) {
    		     var parentObj = linkObj.parents('.comment-comment');
    		     // grab the user span and add it back in
    		     var userSpan = $('.comment-author',parentObj);
    		     parentObj.empty().append( userSpan ).append( ' ' + data.comment );
    		   } else {
             var parentObj = linkObj.parents('.update-sentence-inner:first');
             var bodyObj = $('.update-body', parentObj);
      		   bodyObj.empty().html(data.update);
    		   }
    			 linkObj.remove();
    		 }
    	 });
     });

    $('span.ajax-post-comment', updatePost).each(function(){
      var footerComments = $(this).parents('li').find(".feed-comments");

      sUpdateDisplayPostComments( footerComments, false, false );

      $(this).bind('click', function(){
        sUpdateDisplayPostComments(footerComments, true , true , true );
        return false;
      });

      // if you click into the reply textfield very quickly before the above functionality attaches to the onfocus
      // event of the textfield, you won't see the post button, etc appear. So check if it has focus
      $('textarea:focus',footerComments).trigger('focus');
    });

    $('span.feed-comments-viewall', updatePost).each(function(){
      var footerComments = $(this).parents('li').find(".feed-comments");
      var commentElementID = $(this).attr('id');
      var spliced = commentElementID.split('-');
      var post_id = spliced[3];
      var numComments = spliced[5];

      $(this).bind('click',function(){
        var edge_settings = Drupal.settings.s_edge;

        if( numComments > edge_settings.update_max_comments_show && numComments <= edge_settings.update_max_comments_ajax) {
          sUpdateAjaxGetComment(post_id, footerComments );
          return false;
        }

        if(numComments > edge_settings.update_max_comments_ajax){
          var popup_options = {
            extraClass: 'popups-large update-comments-popup no-buttons',
            href: '/update_post/' + String(post_id) + '/comments',
            hijackDestination: false,
            disableCursorMod: true,
            disableAttachBehaviors: false
          };

          Popups.openPath(this, popup_options, window);
          return false;
        }
      });
    });

    updatePost.sActionLinks({
     hidden: true,
     wrapper: '.update-post-action-links',
     rowClass: '.edge-item'
    });


    $('.like-btn', updatePost ).each(function(){
      $(this).bind('click',function(){
        $('.feed-comments',$(this).parents('.edge-footer')).removeClass('s-update-edge-hide-comments-form');
      });
    });
    
    $('a.delete-update-post' , updatePost ).bind('click',function(e){
      e.preventDefault();
      var linkObj = $(this);
      var deleteHref = linkObj.attr('href');

      sCommonConfirmationPopup({
       title: Drupal.t('Delete Post'),
       body: Drupal.t('Are you sure you want to delete this update?'),
       extraClass: 'popups-small',
       element: this,
       confirm: {
         text: Drupal.t('Delete'),
         func: function(){
          sPopupsClose();
          Popups.addLoading();          
          
           $.ajaxSecure({
             url: deleteHref,
             success: function( response , status , xhr ){
               Popups.removeLoading();          
               var parentObjs = linkObj.parents(".s-edge-type-update-post,.s-edge-type-update-poll");
               parentObjs.empty().addClass('deleted').append(Drupal.t('This update has been deleted'));
             }
           });
         }
       }
      });
    });

    $('.s-js-comment-wrapper', updatePost).each(function(){
      $(this).sActionLinks({hidden: true, wrapper: '.s-js-comment-action-links', rowClass: '.comment-contents'});
    });
    sCommentAttachActions(updatePost);
  });
}

function sUpdateAjaxGetComment(post_id, footerComments ){

  if( $('.feed-comments-viewall-container',footerComments).data('comments_loading') ) return;

  $.ajax({
	  url: "/comment/ajax/" + String(post_id),
	  dataType: 'json',
	  beforeSend: function(){
      $('.comments-loading',footerComments).css('display','inline-block');
      $('.feed-comments-viewall-container',footerComments).data('comments_loading',true);
	  },
	  success: function( data , status , xhr ){
	    $('.feed-comments-viewall-container',footerComments).remove();
	    var sComments = $(data.comments).html();
      $("#s_comments",footerComments).replaceWith(sComments);
      var updatePost = footerComments.closest('.s-edge-type-update-post');
      updatePost.removeClass('sUpdate-processed');
      Drupal.attachBehaviors(updatePost.parent());
	  }
  });
}

function sUpdateDisplayPostComments( footerComments, toggleSComments, toggleSCommentsPostForm , focus_input ){
  if(footerComments==null)
    var footerComments = $(".s-comments-post-form");

  if(toggleSComments)
    $("#s_comments",footerComments).show();

  if(toggleSCommentsPostForm) {
    $(footerComments).show();
    $("div.s-comments-post-form",footerComments).show();
    $("div.feed-comments-top",footerComments).show();
    $("div.feed-comments-viewall-container",footerComments).show();
  }

  var input = footerComments.find("textarea");
  if(input.length){
    var preFilledText = input.attr('defaulttext');

    if(input.val() == '' || input.val() == preFilledText)
      input.val(preFilledText).addClass('pre-fill');

    if( focus_input ) {
      var form = footerComments.is('form') ? footerComments : footerComments.find('form');
      form.trigger('focusin'); // see s_comments_post_comment_form.js for focusin event
      input.trigger('focus');
    }
  }
};function sGradeItemSelectScaleChange(form, gsSelectObj, show_dialog) {
  var gsSelectArea = gsSelectObj.parents('.grading-scale-select-grouping');

  var newVal = gsSelectObj.val();
  var rubric_objective_count = $('.tag-item-from-rubric').length;

  // Rubric selection
  if (Drupal.settings.s_grading_rubrics !== undefined && (Drupal.settings.s_grading_rubrics[newVal] !== undefined || newVal == 'r')) {

    // Show confirmation popup if action would clear existing learning objectives
    var aligned_objective_count = $('.tag-item:not(.tag-item-from-rubric)').length;
    // If learning objectives would be cleared by the action, show dialog
    if (show_dialog && (newVal != 'r' && rubric_objective_count + aligned_objective_count > 0)) {
      if (Drupal.settings.s_grading_rubrics_info[newVal] && 'rubric' in Drupal.settings.s_grading_rubrics_info[newVal]) {
        var rubric_title = Drupal.settings.s_grading_rubrics_info[newVal].rubric.title + ' ';
      } else {
        var rubric_title = "Current rubric ";
      }
      sReplaceLearningObjectivesPopup(form, gsSelectObj, rubric_title, function(result){
        if (result) {
          sGradeItemChangeRubric(form, gsSelectObj);
          $(document).data('previous_scale_selection', $(':selected', gsSelectArea));
        }
      });
    } else {
      sGradeItemChangeRubric(form, gsSelectObj);
      $(document).data('previous_scale_selection', $(':selected', gsSelectArea));
    }
  }
  // Scale selection
  else {
    // popup ?
    if (show_dialog && rubric_objective_count > 0) {
      sReplaceLearningObjectivesPopup(form, gsSelectObj, 0, function(result){
        if (result) {
          sGradeItemChangeScale(form, gsSelectObj);
          $(document).data('previous_scale_selection', $(':selected', gsSelectArea));
        }
      });
    } else {
      sGradeItemChangeScale(form, gsSelectObj);
      $(document).data('previous_scale_selection', $(':selected', gsSelectArea));
    }
  }

  sPopupsResizeCenter();
}

function sGradeItemChangeScale(form, gsSelectObj) {

  var gsSelectArea = gsSelectObj.parents('.grading-scale-select-grouping');
  var newVal = gsSelectObj.val();
  var maxPointsObj = $('#edit-max-points', form);

  $('.option-show-scale', gsSelectArea).addClass('hidden');
  $('#edit-chosen-rubric', gsSelectArea).addClass('hidden');
  $('#edit-selected-rubric').val('');

  // Is this a non-percentage grading scale? Then set the max points and disable the input
  var optionValObj = $($('option[value=' + String(newVal) + ']', gsSelectObj).text());
  var maxPointsSet = !optionValObj.hasClass('scale-type-scale');

  maxPointsObj.prop('disabled', maxPointsSet);
  if (maxPointsSet) {
    var maxPoints = optionValObj.attr('max');
    maxPointsObj.addClass('disabled');
    maxPointsObj.val(maxPoints);
  }
  else {
    maxPointsObj.removeClass('disabled');
  }
  sAlignmentEnableAlignmentButton();
  sPopupsResizeCenter();
}

function sGradeItemChangeRubric(form, gsSelectObj) {
  var gsSelectArea = gsSelectObj.parents('.grading-scale-select-grouping');
  var newVal = gsSelectObj.val();
  var maxPointsObj = $('#edit-max-points', form);
  var selectedRubric = $('#edit-selected-rubric');
  var clearSelection = newVal == "0";

  var newTotalPoints = 0;
  if (Drupal.settings.s_grading_rubrics_info[newVal] && 'rubric' in Drupal.settings.s_grading_rubrics_info[newVal]) {
    sAlignmentRubricUpdate(Drupal.settings.s_grading_rubrics_info[newVal].rubric);
  }

  if (newVal == 'r') {
    $('#grading-rubric-launch-btn', form).click();
    selectedRubric.val('e');
  }
  else if (!clearSelection) {
    newTotalPoints = Drupal.settings.s_grading_rubrics[newVal];
  }

  if (!clearSelection) {
    $('.option-show-scale', gsSelectArea).removeClass('hidden');
    $('#edit-chosen-rubric', gsSelectArea).removeClass('hidden');
    maxPointsObj.val(newTotalPoints);
    maxPointsObj.prop('disabled', true);
    maxPointsObj.addClass('disabled');
    if (newVal != 'r') {
      selectedRubric.val(newVal);
    }
    var broadCastId = newVal == 'r' ? 'e' : newVal;
    sAngular.rootScopeBroadcast('rubricActiveIdChange', broadCastId);
    sAlignmentDisableAlignmentButton();
  }
  else {
    sGradeScaleClearRubricSelection(gsSelectArea);
  }
  sPopupsResizeCenter();
}

function sGradeScaleProcessRubricDropdown(form) {
  $('.grading-scale-select-grouping:not(.sGradesItemAddForm-processed)', form).addClass('sGradesItemAddForm-processed').each(function () {
    var gsSelectArea = $(this);
    var selectMenuItem = $('select', gsSelectArea);
    if (!selectMenuItem.length){
      $('#edit-chosen-rubric', form).click(function () {
        $('#grading-rubric-launch-btn', form).click();
        sAngular.rootScopeBroadcast('rubricActiveIdChange', $('#edit-selected-rubric').val());
      });
      return;
    }

    // initiate the jQuery selectmenu for styling
    selectMenuItem.selectmenu({style: 'dropdown'});

    // Skip event handling if this selectbox is inside a nested "Copy To Courses" form
    var isCopyToCoursesForm = gsSelectArea.parents("div#copy-to-courses").length > 0;
    if (!isCopyToCoursesForm) {
      $('#edit-chosen-rubric', gsSelectArea).click(function () {
        $('#grading-rubric-launch-btn', form).click();
        sAngular.rootScopeBroadcast('rubricActiveIdChange', $('#edit-selected-rubric').val());
      });
      //trigger rubric editor when chosen
      selectMenuItem.change(function (e) {
        // store the current selection
        sGradeItemSelectScaleChange(form, $(this), true);
        e.preventDefault();
      });
      // if a scale is selected
      if (selectMenuItem.val() != "0") {
        sGradeItemSelectScaleChange(form, selectMenuItem, false);
      }
    }
  });
}

function sGradeScaleClearRubricSelection(gsSelectArea){
  $('.option-show-scale', gsSelectArea).addClass('hidden');
  $('#edit-chosen-rubric:not(.display-only)', gsSelectArea).addClass('hidden');
  sAlignmentClearAlignments(true);
  sAlignmentEnableAlignmentButton();
}

/**
 * function sReplaceLearningObjectivesPopup() -- helper function to display a warning message when changing from rubrics to LO's
 */
function sReplaceLearningObjectivesPopup(form, gsSelectObj, rubricTitle, fnOnResponse) {
  var message, buttonText, isAssessment = $('#s-assessment-question-edit-form').length;
  if (isAssessment && !rubricTitle){
    message = Drupal.t('Removing this rubric will remove all learning objectives aligned from this question. Would you like to remove this rubric?')
    buttonText = Drupal.t('Remove Rubric');
  } else {
    if (rubricTitle) {
      buttonText = Drupal.t('Select Rubric');
      message = rubricTitle + ' ' + Drupal.t('contains learning objectives that will replace the learning objectives attached to this assignment. Would you still like to select this rubric?')

    }
    else {
      message = Drupal.t('Selecting this scale will remove all of the learning objectives aligned to this assignment.  Would you like to select this scale?')
      buttonText = Drupal.t('Select Scale');
    }
  }
  var gsSelectArea = gsSelectObj.parents('.grading-scale-select-grouping');
  var popupSettings = {
    extraClass: 'popups-small',
    title: Drupal.t('Replace Learning Objectives'),
    body: message,
    confirm: {
      text: buttonText,
      func: function () {
        sPopupsClose();
        sAlignmentClearAlignments(false);
        sGradeItemChangeScale(form, gsSelectObj);
        $(document).data('previous_scale_selection', $(':selected', gsSelectArea));
        fnOnResponse(true);
      }
    },
    cancel: {
      func: function () {
        // do not change selection
        var previous_scale_selecton = $(document).data('previous_scale_selection');
        if (typeof previous_scale_selecton == 'undefined'){
          previous_scale_selecton = 0;
        }
        $('#edit-grading-scale-id').selectmenu('value', previous_scale_selecton.index());
        fnOnResponse(false);
      }
    }
  };
  sCommonConfirmationPopup(popupSettings);
};// Common date helper methods
/**
 * Takes localized string, either UK or US format, and converts
 * to a Date() object.
 *
 * @param {string} localizedDate - Date in mm/dd/yy or dd/mm/yy format
 * @return {Date}
 */
function sCommonDateFromLocalizedString(localizedDate) {
  var dateFormatLanguage = sCommonGetDateFormat();
  var dateStartsWithMonth = dateFormatLanguage === 'en';
  var dateComponents = localizedDate.split('/');
  var month = dateStartsWithMonth ? dateComponents[0] : dateComponents[1];
  var day = dateStartsWithMonth ? dateComponents[1] : dateComponents[0];
  var year = '20' + dateComponents[2]; // Add '20' for 20xx years, otherwise Date() will assume it's 19xx
  return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
}

/**
 * Gets a normalized date format language either: 'en-GB' or 'en'
 *
 * @returns {string}
 */
function sCommonGetDateFormat() {
  var ukFormat = 'en-GB';
  // backend / rest of SGY Core doesn't use standard date formatting, it's either 'en-GB' or 'US' format.
  if (Drupal.settings.s_common.date_format_language === undefined || Drupal.settings.s_common.date_format_language !== ukFormat) {
    return 'en';
  }
  return ukFormat;
}

/**
 * Checks if date is within range
 *
 * @param {object} dateRange - json object with start/end dates of grading period dates
 * @param {string} date - Current selected due date string in the format 'MM/DD/YY' or 'DD/MM/YY'
 * @returns {boolean}
 */
function sCommonDateInRange(dateRange, date) {
  if (dateRange === 'undefined' || dateRange == null) {
    return false;
  }
  var startDate = new Date(dateRange['start']);
  var endDate = new Date(dateRange['end']);
  var dateValue = sCommonDateFromLocalizedString(date);
  return dateValue >= startDate && dateValue <= endDate;
}

/**
 * Helper to check if grade item form should show due date warning
 *
 * @param {object} gradeEnabledField - Checkbox for enabling/disabling grade
 * @param {object} gradePeriodField - Grade period select field
 * @param {object} dueDateField - Due date input field
 * @return {boolean}
 */
function sCommonShouldShowDueDateWarning(gradeEnabledField, gradePeriodField, dueDateField) {
  // If no grading period dates were passed up, then the form we're showing has no grading period (such as creating
  // discussions within a group or school)
  if (Drupal.settings.grading_period_dates === undefined) {
    return false;
  }

  // If Grading is disabled, no need to validate due date
  if (gradeEnabledField.val() !== undefined && !gradeEnabledField.is(':checked')) {
    return false;
  }

  // If there's no grading period, don't show warning (there's no range)
  var gradingPeriodId = parseInt(gradePeriodField.val());
  if (gradingPeriodId === 0) {
    return false;
  }

  var gradingPeriodDates = Drupal.settings.grading_period_dates[gradingPeriodId];
  var showWarning = false;
  // Iterate through each due date field (CSL has a due date for each section)
  dueDateField.each(function () {
    var val = $(this).val();
    if (val !== "" && !sCommonDateInRange(gradingPeriodDates, val)) {
      showWarning = true;

      // Break the jquery each loop
      return false;
    }
  });

  return showWarning;
}

/**
 * Helper to get translated and formated date string in either
 * MMM DD, YYYY or DD MMM, YYYY
 *
 * @param {Date} date
 * @return {string}
 */
function sCommonDateFormatToString(date) {
  var dateOfMonth = date.getUTCDate();
  var month = date.toLocaleDateString('en',
    {
      month: "long",
      timeZone: 'UTC'
    });
  var monthTranslated = Drupal.date_t(month, 'month_abbr');
  var year = date.getUTCFullYear();

  if (sCommonGetDateFormat() === 'en-GB') {
    return dateOfMonth + " " + monthTranslated + ", " + year;
  }
  return monthTranslated + " " + dateOfMonth + ", " + year;
}

/**
 * Helper to get due date warning text if due date is out of range
 *
 * @param {object} gradePeriodField
 */
function sCommonDateDueDateWarningText(gradePeriodField) {
  var gradingPeriodId = parseInt(gradePeriodField.val());
  var gradingPeriodDates = Drupal.settings.grading_period_dates[gradingPeriodId];
  var gradingPeriodName = gradePeriodField.text();
  var startDate = sCommonDateFormatToString(new Date(gradingPeriodDates['start']));
  var endDate = sCommonDateFormatToString(new Date(gradingPeriodDates['end']));
  return Drupal.t('The due date falls outside the selected grading period: @gradingPeriodName: @startDate to @endDate',
    {
      '@gradingPeriodName': gradingPeriodName,
      '@startDate': startDate,
      '@endDate': endDate,
    });
}

/**
 * Add due date warning to form
 *
 * @param {string} warningText
 * @param {object} siblingElement
 * @param {object} form
 */
function sCommonDateAddDueDateWarning(warningText, siblingElement, form) {
  sCommonDateRemoveDueDateWarning(form);
  // SVG Comes from Backpack.
  var icon = '<svg class="due-date-warning-icon" viewBox="0 0 23 22" width="100%" height="100%">' +
    '<g fill="#fac901" fill-rule="evenodd">' +
    '<path stroke="#333" d="M9.636 2.006c.975-1.814 2.751-1.815 3.727 0l8.665 16.111c.967 1.798.02 3.383-2.027 3.383H2.998C.957 21.5.004 19.914.971 18.117L9.636 2.006z"></path>' +
    '<path fill="#333" fill-rule="nonzero" d="M10.748 13.66l-.219-3.275a24.374 24.374 0 0 1-.061-1.374c0-.379.099-.674.297-.886.198-.211.46-.317.783-.317.392 0 .654.135.786.406.132.272.198.662.198 1.173 0 .3-.016.606-.048.916l-.294 3.37c-.031.4-.1.709-.205.923a.537.537 0 0 1-.52.321c-.245 0-.416-.104-.512-.311-.096-.207-.164-.523-.205-.947zm.759 4.497c-.278 0-.52-.09-.728-.27-.208-.18-.311-.432-.311-.755 0-.283.099-.523.297-.721a.99.99 0 0 1 .728-.298c.287 0 .532.1.735.298a.971.971 0 0 1 .304.72c0 .32-.102.57-.307.753a1.047 1.047 0 0 1-.718.273z"></path>' +
    '</g>' +
    '</svg>';
  var output = '<div class="form-item due-date-warning-wrapper">' +
    '<div>' + icon + '</div>' +
    '<div class="due-date-warning-text">' + warningText + '</div>' +
    '</div>';
  siblingElement.after(output);
}

/**
 * Remove due date warning
 * @param {object} form
 */
function sCommonDateRemoveDueDateWarning(form) {
  $(".due-date-warning-wrapper", form).remove();
}
;Drupal.behaviors.sGradesItemAddForm = function (context) {
  $('#s-discussion-create-form:not(.sGradesItemAddForm-processed), #s-grade-item-add-form:not(.sGradesItemAddForm-processed), #s-assessment-question-edit-form:not(.sGradesItemAddForm-processed)', context).addClass('sGradesItemAddForm-processed').each(function () {

    var form = $(this);
    var isDiscussion = (form.attr('id') == 's-discussion-create-form');
    var dateField = $("input[name='due_date[date]'], .csm-due-date", form);
    var timeField = $("input[name='due_date[time]']", form);

    if (dateField.prop('disabled')) {
      timeField.prop('disabled', true);
    }

    // when the popups close, close any opened rubrics editor opened
    $(document).bind('popups_before_remove', function (event, popup) {
      var formId = $('form', $('#' + popup.id)).attr('id');
      if (formId == 's-discussion-create-form' || formId == 's-grade-item-add-form') {
        $('#grading-rubric-edit-slider .close-btn').click();
      }
    });

    form.on('click', '.factor-toggler', function () {
      $('.factor-wrapper', form).removeClass('hidden');
      $(this).addClass('hidden');
      sPopupsResizeCenter();
    });

    $('.s-grade-item-addl-course-due, .addl-course-options', form).each(function () {
      if ($('.due-date', this).prop('disabled')) {
        $('.time-input input', this).prop('disabled', true);
      }
    });

    dateField.blur(function () {
      var dropboxField = $('#edit-dropbox-enabled');
      dropboxEnabled = dropboxField.is(':checked') || !dropboxField.length;
      dateFieldContext = $(this);
      if (dateFieldContext.hasClass('csm-due-date')) {
        timeFieldContext = dateFieldContext.closest('.container-inline-date').find('.time-input').find('input');
      }
      else {
        timeFieldContext = timeField;
      }
      setTimeout(function () {
        if (dateFieldContext.val() != '' && timeFieldContext.val() == '' && dropboxEnabled) {
          timeFieldContext.val('11:59PM');
        }
      }, 200);
    });

    var toggleDateWarning = function() {
      if (sGradeItemShouldShowDueDateWarning(form)) {
        sGradeItemAddDueDateWarning(form);
        // Expand the grading options when an alert is shown if it's not shown already
        $('.category-options-wrapper, .grading-options-wrapper', form).toggle(true);
      } else {
        sCommonDateRemoveDueDateWarning(form);
      }
      sPopupsResizeCenter();
    };

    toggleDateWarning();
    dateField.change(toggleDateWarning);
    $("select[name='grading_period_id'], select[name='grading_period_id_final']", form).change(toggleDateWarning);
    $(".section-selection input", form).change(toggleDateWarning);
    $("input[name='enable_grading']", form).change(toggleDateWarning);

    $('#edit-dropbox-enabled', form).change(function () {
      dropboxEnabled = $(this).is(':checked');
      if ($("input[name='due_date[date]']").val() != '' && $("input[name='due_date[time]']").val() == '' && dropboxEnabled) {
        $("input[name='due_date[time]']").val('11:59PM');
      }
      context = $('#copy-to-courses');
      $('.due-date', context).each(function () {
        if ($(this).val() != '' && dropboxEnabled) {
          parent = $(this).parents('.addl-course').filter(':first');
          if ($('.time-input input', parent).val() == '') {
            $('.time-input input', parent).val('11:59PM');
          }
        }
      });
    });

    // grading options show/hide
    $(".toggle-category-options", form).click(function () {
      $('.category-options-wrapper', form).toggle();
      sPopupsResizeCenter();
      return false;
    });

    $(document).bind('popups_before_serialize', function (e, $form) {
      $('#edit-max-points', form).removeClass('disabled');
      $('#edit-max-points', form).prop('disabled', false);

    });


    sGradeScaleProcessRubricDropdown(form);

    // advanced options show/hide
    var advancedWrapper = $('.advanced-options-wrapper', form);
    $(".toggle-advanced-options", form).click(function () {
      sPopupsResizeCenter();
      if (advancedWrapper.is(':visible')) {
        $(this).removeClass('active');
        advancedWrapper.hide();
      }
      else {
        $(this).addClass('active');
        advancedWrapper.show();
      }
      return false;
    });

    $('body').click(function (e) {
      var target = $(e.target);
      if (advancedWrapper.is(':visible') && !target.hasClass('advanced-options-wrapper') && target.parents('.advanced-options-wrapper').length == 0)
        $(".toggle-advanced-options", form).click();
    });

    sGradesApplyHoverListener(form, '#category-wrapper .form-select');

    // create new category
    $("#edit-new-category-wrapper input").focus(function () {
      var defaultText = Drupal.t('e.g. Homework');
      var el = $(this);
      if (el.val() == defaultText) {
        el.val('');
        el.removeClass('pre-fill');
      }
    }).blur(function () {
      var defaultText = Drupal.t('e.g. Homework');
      var el = $(this);
      if (el.val() == '') {
        el.val(defaultText);
        el.addClass('pre-fill');
      }
    });

    var categorySelect = $('select[name=grading_category_id]', form),
      newCategoryInput = categorySelect.parent().siblings('#edit-new-category-wrapper'),
      newCategoryCancel = categorySelect.parent().siblings('.edit-new-category-cancel');

    // fill in defaults for selected category
    newCategoryInput.hide();
    newCategoryCancel.hide();
    categorySelect.change(function () {
      var category = $(this).val();
      if (category == 'new') {
        newCategoryInput.show();
        newCategoryCancel.show();
        categorySelect.hide();
      }
      else {
        newCategoryInput.hide();
        newCategoryCancel.hide();
        categorySelect.show();
      }
      sPopupsResizeCenter();
      return true;
    });

    // cancel new category input
    newCategoryCancel.click(function () {
      categorySelect.val('').triggerHandler('change');
    });

    // copy to courses
    var addlCoursesCheckboxes = $('#addl-courses .addl-course input[type=checkbox][name$="[enabled]"]', form),
      copyToCoursesBtn = $('.adv-option-btn.toggle-copy', form);
    addlCoursesCheckboxes.each(function () {
      var addlElements = $(this).parent().parent().siblings();
      $(this).click(function () {
        var checked = $(this).is(':checked'),
          contextForm = $(this).parents('.addl-course').filter(':first');
        if (checked) {
          var mainDueWrapper = $("#edit-due-date-wrapper", form);
          var dueDate = $("input:first", mainDueWrapper).val();
          var hasTime = $("input[type=checkbox]", mainDueWrapper).is(":checked");
          var dueTime = $("input:last", mainDueWrapper).val();
          var addlCourseDueWrapper = $('.container-inline-date', addlElements);
          $("input:first", addlCourseDueWrapper).val(dueDate);
          $("input[type=checkbox]", addlCourseDueWrapper).attr('checked', hasTime);
          $("input:last", addlCourseDueWrapper).val(dueTime);
          if (!hasTime) {
            $("input[type=checkbox]", addlCourseDueWrapper).next().hide();
            $("input[type=checkbox]", addlCourseDueWrapper).next().val('');
          }
          addlElements.show();
        }
        else {
          addlElements.hide();
        }

        $('.due-date', contextForm).blur(function () {
          context = this;
          parent = $(this).parents('.addl-course').filter(':first');
          setTimeout(function () {
            dropboxEnabled = $('#edit-dropbox-enabled').is(':checked');
            if ($(context).val() != '' && $('.time-input input', parent).val() == '' && dropboxEnabled) {
              $('.time-input input', parent).val('11:59PM');
            }
          }, 200);
        });

        sPopupsResizeCenter();

        // set the copy-to-courses button active based on whether any of the addition courses is selected
        if (addlCoursesCheckboxes.is(':checked')) {
          copyToCoursesBtn.addClass('active');
        }
        else {
          copyToCoursesBtn.removeClass('active');
        }
      });

      $(this).attr('checked', false);
      addlElements.hide();

    });

    $('#s-grade-item-add-enable-time', form).click(function () {
      var checked = $(this).is(':checked');
      if (checked) {
        $("#edit-due-date-timeEntry-popup-1-wrapper").show();
      }
      else {
        $("#edit-due-date-timeEntry-popup-1-wrapper").hide();
        $("#edit-due-date-timeEntry-popup-1").val('');
      }
    })
    if ($('#s-grade-item-add-enable-time', form).is(':checked'))
      $("#edit-due-date-timeEntry-popup-1-wrapper").show();

    $('.s-grade-item-addl-courses-enable-time', form).click(function () {
      var checked = $(this).is(':checked');
      if (checked) {
        $(this).next().show();
      }
      else {
        $(this).next().hide();
        $("input", $(this).next()).val('');
      }
    });

    $('#edit-is-final', form).click(function () {
      sGradeItemResolveIndAssign(form, $(this));
      sPopupsResizeCenter();
      toggleDateWarning();
    });


    if ($('#edit-is-final', form).is(':checked')) {
      form.addClass('s-grade-item-is-final');
      $("#category-wrapper", form).hide();
      $(".grading-period-leaf-periods-wrapper", form).hide();
      $('.grading-period-all-periods-wrapper', form).show();
      //Lock down individual assignments for existing grade items
      sGradeItemResolveIndAssign(form, $('#edit-is-final', form));
      sPopupsResizeCenter();
    }

  });

  $("#s-library-template-copy-form:not(.sGradeItemAddForm-processed), #s-library-import-template-form:not(.sGradeItemAddForm-processed)", context).addClass('sGradesItemAddForm-processed').each(function () {
    var form = $(this);
    // "is final" checkbox behavior
    $('.addl-is-final input:not(.sGradeItemAddForm-processed)', form).addClass('sGradeItemAddForm-processed').each(function () {
      var finalBox = $(this);
      finalBox.click(function () {
        var checkbox = $(this);
        var checkboxWrapper = checkbox.parents('.addl-is-final');

        if (checkbox.is(':checked')) {
          checkboxWrapper.siblings(".addl-grading-category").hide();
          checkboxWrapper.siblings(".addl-grading-period").hide();
          checkboxWrapper.siblings('.grading-period-all-periods-wrapper').show();
          sPopupsResizeCenter();
        }
        else {
          checkboxWrapper.siblings(".addl-grading-category").show();
          checkboxWrapper.siblings(".addl-grading-period").show();
          checkboxWrapper.siblings('.grading-period-all-periods-wrapper').hide();
          sPopupsResizeCenter();
        }
      });
    });
    //date picker behavior
    $('.s-grade-item-addl-course-due:not(.sGradeItemAddForm-processed)', form).addClass('sGradeItemAddForm-processed').each(function () {
      var datePicker = $(this);
      var dateInputs = $('input', datePicker);

      if (dateInputs.length > 1) {
        //first input is date
        var day = $(dateInputs[0]);
        //second is time
        var time = $(dateInputs[1]);
        day.blur(function () {
          var dropboxEnableWrapper = datePicker.siblings('.dropbox-enable-wrapper');
          var dropboxEnabledInput = $('input.dropbox-enable', dropboxEnableWrapper);
          var autoAddTime = true;

          //if there is a dropbox and it is not enabled, don't autoAddTime
          if (dropboxEnabledInput.length > 0 && !dropboxEnabledInput.is(':checked')) {
            autoAddTime = false;
          }

          if (autoAddTime) {
            setTimeout(function () {
              if (day.val() != '' && time.val() == '') {
                time.val('11:59PM');
              }
            }, 200);
          }
        });
      }
    });
  });

  //$('#s-library-template-copy-form:not(.sGradeItemAddForm-processed)').addClass('sGradesItemAddForm-processed').each(function(){
  var form = $(this);
  //})

  // homepage smartbox form
  $('#s-grade-item-add-combined-form:not(.sGradesItemAddCombinedForm-processed)').addClass('sGradesItemAddCombinedForm-processed').each(function () {
    var form = $(this);
    var realmChooser = $('#edit-realms', form);
    var courses = $('#addl-courses', form);
    // advanced options show/hide
    var advancedWrapper = $('.advanced-options-wrapper', form);
    $(".toggle-advanced-options", form).click(function () {
      sPopupsResizeCenter();
      if (advancedWrapper.is(':visible')) {
        $(this).removeClass('active');
        advancedWrapper.hide();
      }
      else {
        $(this).addClass('active');
        advancedWrapper.show();
      }
      return false;
    });
    $('body').click(function (e) {
      var target = $(e.target);
      if (advancedWrapper.is(':visible') && !target.hasClass('advanced-options-wrapper') && target.parents('.advanced-options-wrapper').length == 0)
        $(".toggle-advanced-options", form).click();
    });

    realmChooser.bind('sHomeSmartBoxRealmSelectionUpdate', function (e, selected) {
      $('.addl-course', courses).each(function () {
        var course = $(this);
        var courseId = course.attr('id').replace(/^assignment-/, '');
        if ($.inArray(courseId, selected) == -1) {
          course.filter(':visible').hide();
        }
        else {
          courses.show();
          course.filter(':not(:visible)').appendTo(courses).show();
          sGradesApplyHoverListener(course, '#category-wrapper .form-select');
        }
      });

      $('.addl-course-first', courses).removeClass('addl-course-first');
      if (selected.length > 1)
        $('.addl-course:visible:eq(0)', courses).addClass('addl-course-first');

      $('#edit-dropbox-enabled').change(function () {
        $('.due-date').each(function () {
          if ($(this).val() != '') {
            parent = $(this).parents('.addl-course').filter(':first');
            if ($('.time-input input', parent).val() == '') {
              $('.time-input input', parent).val('11:59PM');
            }
          }
        });
      });

      $(".due-date").each(function () {
        $(this).unbind('blur');
        $(this).blur(function () {
          var parent = $(this).parents('.addl-course').filter(':first');
          var context = this;

          setTimeout(function () {
            if ($(context).val() != '' && $('.time-input input', parent).val() == '' && $('#edit-dropbox-enabled').is(':checked')) {
              $(".time-input input", parent).val('11:59PM');
            }
          }, 500);
        });
      });

    });

    // "copy settings" behavior"
    $('.copy-settings', courses).click(function () {
      // clear option-not-found warnings
      $('.option-not-found', courses).remove();

      // gather data
      var addlCourse = $(this).parents('.addl-course');
      var dueDate = $("input[id*=due-due-date-datepicker-popup]", addlCourse).val();
      var dueTime = $("input[id*=due-due-date-timeEntry-popup]", addlCourse).val();
      var categoryTitle = $('.addl-grading-category select option:selected', addlCourse).text();
      var scaleTitle = $('.addl-grading-scale select option:selected', addlCourse).text();

      //Select text from the grading hierarchy input if available, otherwise default to the regular grading period input
      if ($('.grading-period-all-periods-wrapper select option:selected', addlCourse).is(':visible')) {
        var periodTitle = $('.grading-period-all-periods-wrapper select option:selected', addlCourse).text();
        var periodFieldClass = '.grading-period-all-periods-wrapper ';
      }
      else {
        var periodTitle = $('.addl-grading-period select option:selected', addlCourse).text();
        var periodFieldClass = '.addl-grading-period ';
      }

      var optionLock = $('.lock-form-container select', addlCourse).val();
      var optionLockDate = $('.lock-form-container input:eq(0)', addlCourse).val();
      var optionLockTime = $('.lock-form-container input:eq(1)', addlCourse).val();

      // set data
      addlCourse.siblings(':visible').each(function () {
        var addlCourseDest = $(this);
        $("input[id*=due-due-date-datepicker-popup]", addlCourseDest).val(dueDate);
        $("input[id*=due-due-date-timeEntry-popup]", addlCourseDest).val(dueTime);

        var categoryOption = $('.addl-grading-category select option:contains("' + categoryTitle + '")', addlCourseDest);
        if (categoryOption.length) {
          categoryOption.attr('selected', 'selected');
        }
        else {
          sGradeItemAddWarning($('.addl-grading-category select', addlCourseDest), categoryTitle);
        }

        var scaleOption = $('.addl-grading-scale select option:contains("' + scaleTitle + '")', addlCourseDest);
        if (scaleOption.length) {
          scaleOption.attr('selected', 'selected');
        }
        else {
          sGradeItemAddWarning($('.addl-grading-scale select', addlCourseDest), scaleTitle);
        }

        var periodOption = $(periodFieldClass + 'select option:contains("' + periodTitle + '")', addlCourseDest);

        if (periodOption.length) {
          periodOption.attr('selected', 'selected');
        }
        else {
          sGradeItemAddWarning($(periodFieldClass + 'select', addlCourseDest), periodTitle);
        }

        $('.lock-form-container select', addlCourseDest).val(optionLock);
        if (optionLock == 1) {
          $('.lock-form-container input:eq(0)', addlCourseDest).val(optionLockDate);
          $('.lock-form-container input:eq(1)', addlCourseDest).val(optionLockTime);
          $('.lock-form-date-selector-container', addlCourseDest).removeClass('hidden');
        }
        else {
          $('.lock-form-date-selector-container', addlCourseDest).addClass('hidden');
        }
      });
    })

    function sGradeItemAddWarning(object, option) {
      var output = '<span class="option-not-found"><span></span></span>';

      var $output = $(output);
      $output.tipsy({
        html: true,
        title: function () {
          return Drupal.t('%option was not found', {'%option': option});
        }
      });

      object.after($output);
    }

    // "is final" checkbox behaviors
    $('#edit-is-final', form).click(function () {
      if ($(this).is(':checked')) {
        $(".addl-grading-category", courses).hide();
        $(".addl-grading-period", courses).hide();
        $('.grading-period-all-periods-wrapper').show();
      }
      else {
        $(".addl-grading-category", courses).show();
        $(".addl-grading-period", courses).show();
        $('.grading-period-all-periods-wrapper').hide();
      }
    });
  });

  $(document).bind('sAlignmentAlignmentBtnProcessed', function () {
    var selectedRubric = $('#edit-selected-rubric').val();
    if (selectedRubric && selectedRubric != '') {
      sAlignmentDisableAlignmentButton();
    }
    $(document).unbind('sAlignmentAlignmentBtnProcessed');
  });

  $('.availability-section:not(.sGradesItemAddForm-processed)').addClass('sGradesItemAddForm-processed').each(function() {
    var $availabilitySection = $(this);
    var $availability = $('select', $availabilitySection);
    var availability = $availability.val();
    sGradeItemProcessAvailability(availability, $availabilitySection);
    sPopupsResizeCenter();

    $availability.change(function(){
      var availability = $('select', $availabilitySection).val();
      sGradeItemProcessAvailability(availability, $availabilitySection);
      sPopupsResizeCenter();
    });
  });

  $('.password-section:not(.sGradesItemAddForm-processed)').addClass('sGradesItemAddForm-processed').each(function() {
    var $passwordSection = $(this);
    var $passwordSelect = $('select', $passwordSection);
    sGradeItemProcessPassword($passwordSelect.val(), $passwordSection);

    $passwordSelect.change(function(){
      sGradeItemProcessPassword($passwordSelect.val(), $passwordSection);
    });
  });
}

function sGradeItemPopupsCallback(data, options, element) {
  if (data.testQuiz) {
    return sTestQuizPopupCallback(data);
  }

  var nid = data.assignment_nid;
  window.location.href = '/assignment/' + nid;
  return false;
}

function sTestQuizPopupCallback(data) {
  window.location.href = '/course/' + data.section_id + '/assessments/' + data.assignment_nid;
  return false;
}

function sGradeItemResolveIndAssign(form, itemIsFinal) {
  //Helper function to ensure correct individual assignment/"set as midterm/final" form behavior
  if (itemIsFinal.is(':checked')) {
    form.addClass('s-grade-item-is-final');
    $("#category-wrapper", form).hide();
    $(".category-wrapper", form).hide();
    $(".addl-grading-category", form).hide();
    $(".grading-period-leaf-periods-wrapper", form).hide();
    $('.grading-period-all-periods-wrapper', form).show();
    // If individual assignments are already active set a warning message
    if ($('#ind-assign-container', form).hasClass('active')) {
      form.parents('.popups-body').first().prepend('<div id="ind-assign-warn" class="messages warning">' + Drupal.t("Midterm and final grade items cannot be individually assigned") + '</div>');
    }
    // Hide the individual Assign button and clear out any individual assignees
    $('#ind-assign-wrapper', form).addClass('disabled').removeClass('active').attr('disabled-title', Drupal.t('Midterm and final grade items cannot be individually assigned'));
    $('#ind-assign-container.active', form).addClass('hidden').removeClass('active');
    $('.selected-enrollment').remove();
    $('#edit-selected-eids,#edit-selected-gg-ids').val('');
  }
  else {
    form.removeClass('s-grade-item-is-final');
    $("#category-wrapper", form).show();
    $(".category-wrapper", form).show();
    $(".addl-grading-category", form).show();
    $(".grading-period-leaf-periods-wrapper", form).show();
    $('.grading-period-all-periods-wrapper', form).hide();
    //Un-disable the individual assign button but don't un-hide the individual assign textfield container
    //This should reset the visual elements for individual assign to a clean state (button is not active, field is hidden)
    $('#ind-assign-wrapper', form).removeClass('disabled');
    // Remove the finals/individual assign conflict warning message
    $('#ind-assign-warn').remove();
  }
}

function sGradeItemProcessAvailability(availability, $availabilitySection) {
  var startDatepicker = $('.availability-datepicker-row:eq(0)', $availabilitySection);
  var endDatepicker = $('.availability-datepicker-row:eq(1)', $availabilitySection);

  switch(availability) {
    case '0': // S_ASSESSMENT_AVAILABILITY_HIDE
    case '1': // S_ASSESSMENT_AVAILABILITY_SHOW
      startDatepicker.hide();
      endDatepicker.hide();
      break;
    case '2': // S_ASSESSMENT_AVAILABILITY_NOW_UNTIL
      startDatepicker.hide();
      endDatepicker.show();
      break;
    case '3': // S_ASSESSMENT_AVAILABILITY_FROM_UNTIL
      startDatepicker.show();
      endDatepicker.show();
      break;
  }
}

function sGradeItemProcessPassword(passwordSelectValue, $passwordSection) {
  var $passwordField = $('.password-value-wrapper', $passwordSection)
  switch(passwordSelectValue) {
    case '4': // S_GRADE_ITEM_PASSWORD_DISABLE
      $passwordField.hide();
      sPopupsResizeCenter();
      break;
    case '5': // S_GRADE_ITEM_PASSWORD_ENABLE
      $passwordField.show();
      sPopupsResizeCenter();
      break;
  }
}

/**
 * Grading period elements are different based on whether the grading options is checked or not.
 *
 * @param {jQuery|HTMLElement} form
 * @return {jQuery|HTMLElement}
 */
function sGradeItemGetGradingPeriodElement(form) {
  if ($("input[name='is_final']").is(":checked")) {
    return $("select[name='grading_period_id_final'] :selected", form);
  }
  return $("select[name='grading_period_id'] :selected", form);
}

/**
 * Helper to check if grade item form should show due date warning
 *
 * @param {jQuery} form
 * @return {boolean}
 */
function sGradeItemShouldShowDueDateWarning(form) {
  // This would mean s_common_date_helper.js wasn't imported, make sure the date picker still works.
  if (typeof sCommonDateInRange === "undefined") {
    return false;
  }

  return sCommonShouldShowDueDateWarning(
    $("input[name='enable_grading']", form),
    sGradeItemGetGradingPeriodElement(form),
    $("input[name='due_date[date]']:visible, .csm-due-date:visible", form)
  );
}

/**
 * Helper to add the due date warning
 *
 * @param {object} form
 */
function sGradeItemAddDueDateWarning(form) {
  var gradePeriodField = sGradeItemGetGradingPeriodElement(form);
  var siblingElement = $(".grading-period-leaf-periods-wrapper", form).first();
  var warningText = sCommonDateDueDateWarningText(gradePeriodField);
  sCommonDateAddDueDateWarning(warningText, siblingElement, form);
}
;// grading category tooltip
function sGradesApplyHoverListener($form, selectors) {
  var tipsyEnabled = false;
  var $dropdown = $(selectors, $form);
  var selectedValue;
  $dropdown.change(function () {
    selectedValue = $dropdown.find('option:selected').attr('value');
  });

  $dropdown.on('mouseover', function () {
    var $select = $(this);
    if (selectedValue === '0') {
     $select.tipsy({
       html: true,
       gravity: 's',
       trigger: 'manual',
       title: function () {
         return Drupal.t('Ungraded items cannot be scored and do not appear in the default view of the gradebook. To view this item from your gradebook, use the Ungraded filter in the All Categories drop-down menu.');
       }
     });
     tipsyEnabled = true;
     $select.tipsy('show');
    }
    else if (tipsyEnabled) {
      $select.tipsy('hide');
      tipsyEnabled = false;
    }
  });
  $form.on('mouseout', selectors, function () {
    var $select = $(this);
    if (tipsyEnabled){
      $select.tipsy('hide');
      tipsyEnabled = false;
    }
  });
};Drupal.behaviors.sCourseMaterialsLock = function(context) {
  $('.toggle-dropbox:not(.sCourseMaterialsLock-processed)', context).addClass('sCourseMaterialsLock-processed').each(function () {
    if(typeof sCommonAdvancedOptions == 'object'){
      var thisForm = $(this).closest('form');
      var lockedFieldsWrapper = $('.lock-form-container', thisForm);
      var lockDateSelectorWrapper = $('.lock-form-date-selector-container', thisForm);
      var lockBtn = $('.lock-btn', thisForm);
      sCommonAdvancedOptions.registerEvent(thisForm.attr('id'), 'dropbox', 'sCourseMaterialsLock', function(btnObj){
        if(btnObj.hasClass('adv-option-on')) {
          lockBtn.removeClass('disabled');
        }
        else {
          lockBtn.addClass('disabled').removeClass('active').attr('disabled-title', Drupal.t('Locking requires assignment submissions to be enabled'));
          sCommonAdvancedOptionsSetupToggleTipsy(lockBtn);
          lockedFieldsWrapper.addClass('hidden');
          lockDateSelectorWrapper.addClass('hidden');
          $('.lock-date-dropdown', thisForm).val(0);
          sPopupsResizeCenter();
        }
      });
    }
  });

  $('#lock-btn-selector:not(.sCourseMaterialsLock-processed)', context).addClass('sCourseMaterialsLock-processed').each(function () {
    var lockBtn = $(this);
    if(!lockBtn.hasClass('disable-lock-setup')){
      var thisForm = lockBtn.closest('form');
      var giDropBox = $('.adv-option-dropbox', thisForm);
      sCourseMaterialsSetupLock(lockBtn, thisForm, giDropBox, true);
    }
	});

};

function sCourseMaterialsSetupLock(lockButton, lockWrapper, giDropBox, setupEvent){
  var lockedFieldsWrapper = $('.lock-form-container', lockWrapper);
  if(!$('.lock-form-container', lockWrapper).hasClass('hidden')){
    // if the lock form is being initially show, add the active class
    lockButton.addClass('active');
  }
  if(giDropBox.length == 1 && !$(giDropBox).attr('checked')) {
    // if the dropbox is disabled, disable the locking feature
    lockButton.addClass('disabled').removeClass('active');
  }

  if(typeof sCommonAdvancedOptions == 'object' && setupEvent){
    sCommonAdvancedOptions.registerEvent(lockWrapper.attr('id'), 'lock', 'sCourseMaterialsLock', function(btnObj){
      if(!btnObj.hasClass('disabled')) {
        sCourseMaterialsToggleLock(lockWrapper, lockedFieldsWrapper, giDropBox, false);
      }
    });
  }

  $('.lock-date-dropdown', lockWrapper).change(function(){
    var lockDateSelectorWrapper = $('.lock-form-date-selector-container', $(this).parents('.lock-form-container'));
    switch($(this).val()) {
      case '0': // unlocked
        lockDateSelectorWrapper.addClass('hidden');
        $('.adv-option-btn.lock-btn', lockWrapper).removeClass('active');
        break;

      case '1': // lock on
        lockDateSelectorWrapper.removeClass('hidden');
        $('.adv-option-btn.lock-btn', lockWrapper).addClass('active');
        break;

      case '2': // lock now
        lockDateSelectorWrapper.addClass('hidden');
        $('.adv-option-btn.lock-btn', lockWrapper).addClass('active');
        break;
    }
  });
}

function sCourseMaterialsToggleLock(lockWrapper, lockedFieldsWrapper, giDropBox, toggle){
  // dropbox is required for assignments
  if(giDropBox.length == 1 && !$(giDropBox).attr('checked')) {
    return;
  }
  if(toggle){
    lockedFieldsWrapper.toggleClass('hidden');
  }
  else{
    lockedFieldsWrapper.removeClass('hidden');
  }

  $('.lock-date-dropdown', lockWrapper).val(0);
  // trigger change below, setting the appropiate lock-field/adv-btn states
  $('.lock-date-dropdown', lockWrapper).trigger('change');
  sPopupsResizeCenter();
};Drupal.behaviors.sEventAddForm = function(context){

  $('#s-event-add-form:not(.sEventAddForm-processed),#s-event-add-combined-form:not(.sEventAddForm-processed)', context).addClass('sEventAddForm-processed').each(function(){
    var form = $(this);

    nodeExists = false;
    if(typeof Drupal.settings.s_event != 'undefined'){
      nodeExists = Drupal.settings.s_event.node_exists;
    }

    if(nodeExists == 'true'){
      $('#edit-rsvp').change(function(){
        if($(this).val() == Drupal.settings.s_event.rsvp_none){
          $('#edit-rsvp-wrapper').append('<span class="rsvp-warning"><span></span>' + Drupal.t('Setting RSVP to none will remove all external invites') + '</span>');
        }
        else{
          $('.rsvp-warning').remove();
        }
      });
    }

    $("#edit-description", form).elastic();

    $("#edit-cancel",form).bind('click',function(e){
      e.preventDefault();
      var popup = Popups.activePopup();
      Popups.close( popup );
    });

    $('input[name="end[time]"]').blur(function(){
      if($(this).val() != ''){
        $('#edit-has-end-time').val(1);
      }
    	else{
    		$('#edit-has-end-time').val(0);
    	}
    });


    $('input[name="end[date]"]').blur(function(){
    	context = this;
    	setTimeout(function(){
	    	if($(context).val() != ''){
	    		$('#edit-has-end').val(1);
	    	}
	    	else{
	    		$('#edit-has-end').val(0);
	    		$('#edit-has-end-time').val(0);
	    		$('input[name="end[time]"]').val('');
	    	}
    	}, 500);
    });

    // toggle end time
    $(".show-end-time",form).bind('click',function(){
      var end_wrapper = $('#edit-end-wrapper', form);
      var disp = end_wrapper.css('display')=='none';

      if( disp ){
        end_wrapper.css('display','block');
        end_wrapper.find('*').filter(Drupal.sAccessibility.focusableElementsString).filter(':visible').eq(0).trigger('focus');
        $(this).html(Drupal.t('Remove End Time'));
        $("#edit-has-end").val("1");
      } else {
        end_wrapper.css('display','none');
        $(this).html(Drupal.t('Add End Time'));
        $("#edit-end",form).val('');
        $("#edit-end-timeEntry-popup-1",form).val();
        $("#edit-has-end").val("0");
      }

      sPopupsResizeCenter();
    });

    var end_time_disp = $("#edit-has-end",form).val()==1 ? 'block' : 'none';
    $('#edit-end-wrapper', form).css('display',end_time_disp);

    var copyToCourseContainer = $('#copy-to-courses', form).find('.form-checkboxes'),
        copyToCourseCheckboxes = copyToCourseContainer.find('.form-checkbox'),
        copyToCourseBtn = $(".toggle-copy", form);
    copyToCourseBtn.click(function(){
      copyToCourseContainer.toggle();

      sPopupsResizeCenter();

      return false;
    });

    copyToCourseCheckboxes.click(function(){
      if(copyToCourseCheckboxes.is(':checked')){
        copyToCourseBtn.addClass('active');
      }
      else{
        copyToCourseBtn.removeClass('active');
      }
    });

    sPopupsResizeCenter();

    form.sioscompat({override: false });
  });

  // Populate start date with today
  $('form input[id^=edit-start-datepicker-popup][defaultdate]:not(.sEventAddForm-processed)',context).addClass('sEventAddForm-processed').each(function(){
    var input = $(this);
    if(input.val().length == 0){
      input.val(input.attr('defaultdate'));
    }

 });
};
var wait_image = '/sites/all/themes/schoology_theme/images/ajax-loader.gif';
var wait_image_width = 43;
var wait_image_height = 11;

Drupal.behaviors.s_comment = function(context){
	sCommentEnableCommentJump();

  var attachmentEnabled = $('#edit-allow-attachments-1').val() == 1,
      pageIsAssignment = $('body').hasClass('s_grade_item_assignment'),
      pageIsAssessment = $('body').hasClass('s_grade_item_assessment'),
      richTextEnabled = typeof tinyMCE != 'undefined';

  /**
   * Helper function to show/hide the reply form.
   * Manages the bootstrapping of the rich text editor
   *
   * @param object commentReplyForm
   * @param bool show
   */
  function toggleReplyForm(commentReplyForm, show, toolbar){
    show ? commentReplyForm.show() : commentReplyForm.hide();

    if(typeof toolbar == 'undefined' || !toolbar){
      toolbar = 'basic_comment';
    }

    var editorId = commentReplyForm.data('editor_id');
    if(show){
      if(richTextEnabled){
        if(editorId){
          // refresh the editor
          tinyMCE.execCommand('mceAddControl', true, editorId);
          tinyMCE.execCommand('mceFocus', false, editorId);
        }
        else{
          editorId = commentReplyForm.find('.s-tinymce-load-editor').attr('id');
          sTinymceInit({
            elements: editorId,
            toolbar: toolbar
          });
          commentReplyForm.data('editor_id', editorId);
          tinyMCE.execCommand('mceFocus', false, editorId);
        }
      }
      else{
        commentReplyForm.find('#edit-reply').trigger('focus');
        var textareaObj = commentReplyForm.find('textarea:not(.sComment-processed)');
        if(textareaObj.length){
          textareaObj.addClass('sComment-processed')
                     .elastic();
        }
      }
      if(attachmentEnabled) {
        if(!sAttachmentMoveForm(commentReplyForm, '.submit-span-wrapper', 'before')){
          resetAttachmentForm();
        }
      }
    }
    else{
      if(editorId){
        tinyMCE.execCommand('mceRemoveControl', true, editorId);
      }
    }
  }

  $('#s_comments:not(.sCommentProcessed)', context).addClass('sCommentProcessed').each(function(){
    var commentsWrapper = $(this);
    commentsWrapper.on('click', '.expander-link-expanded, .expander-link-collapsed', function(e){
      var targetObj = $(e.target);
      var targetWrapper = targetObj.closest('.expander-bar');
      var childrenWrapper = targetWrapper.nextAll('.s_comments_level:first');
      var rootComment = targetWrapper.prevAll('.comment:first');

      if (!targetObj.hasClass('clickable')) {
        targetObj = targetObj.parent();
      }
      var wasExpanded = targetObj.hasClass('expander-link-expanded');
      if(wasExpanded){
        //currently expanded
        var otherObj = $('.expander-link-collapsed', targetWrapper);
        childrenWrapper.addClass('hidden');
      }
      else{
        //currently collapsed
        var otherObj = $('.expander-link-expanded', targetWrapper);
        childrenWrapper.removeClass('hidden');
      }
      targetObj.addClass('hidden');
      otherObj.removeClass('hidden');

      //save the expanded/collapsed state
      var objNid = $('.comment-nid', commentsWrapper).text();
      var cookieName = 'collapsedThreads-' + objNid;
      var curCookie = $.cookie(cookieName);
      if(typeof curCookie == 'undefined' || !curCookie){
        curCookie = [];
      }
      else{
        curCookie = curCookie.split(',');
      }
      var threadID = rootComment.attr('id');
      threadID = threadID.split('-')[1];
      if(wasExpanded){
        if(curCookie.indexOf(threadID) == -1){
          curCookie.push(threadID);
        }
      }
      else{
        curCookie = searchAndRemove(curCookie, threadID);
      }
      curCookie = curCookie.join(',');
      $.cookie(cookieName, curCookie, {expires : 30});
    });
  });

  // comment reply form that is rendered at the end of the page outside of the comment tree
  // the form is moved throughout the page depending on where the user hits the reply link
  $('#s-comment-reply-form:not(.sCommentProcessed)', context).addClass('sCommentProcessed').each(function(){
    var formObj = $(this);
    var editReply = $('#edit-reply', formObj); // post new reply textarea
    var editComment = $('#edit-comment'); // post new comment textarea
    var submitButton = $('.form-submit', formObj);
    var submitSpan = submitButton.parent('.submit-span-wrapper:first');

    function enableButton(enable){
      submitButton.prop('disabled', !enable);
      submitSpan.toggleClass('disabled', !enable);
    }

    if(richTextEnabled){
      var rteInit = true;
      tinyMCE.onAddEditor.add(function(tme, editor){
        // Add hook for when a new rich text editor has been added.
        // Determine if the new editor is the comment reply, if so binds a keyup event so the "Post Reply" button is only
        // enabled when there is content in the editor.
        if(editor.id == editReply.attr('id')){
          editor.onChange.add(function(){
            var hasContent = !!$(editor.getBody().innerHTML).text().length;
            enableButton(hasContent);
          });
          if(rteInit){
            enableButton(false);
            rteInit = false;
          }
          if(attachmentEnabled){
            editor.onActivate.add(function(){
              sAttachmentMoveForm(editReply.closest('form'), '.submit-span-wrapper', 'before');
            });
          }
        }

        // When the edit comment editor is focused, grab the attachment form
        if(editor.id == editComment.attr('id')){
          if(attachmentEnabled){
            editor.onActivate.add(function(){
              sAttachmentMoveForm(editComment.closest('form'), '.submit-span-wrapper', 'before');
            });
          }
        }
      });
    }
    else{
      editReply.on('keyup focus', function(){
        enableButton(editReply.val().length);
      });
    }
  });

  // move the reply comment form to the clicked reply link
  $(".reply-comment:not(.sComment-processed)", context).addClass('sComment-processed').each(function(){
    var comment = $(this).parents('.comment').eq(0);
    var commentFooter = comment.children('.comment-footer');
    var isBlog = comment.closest('.blog-comments').length > 0;
    var isDiscussion = comment.closest('.discussion-view').length > 0;
    var toolbar = isDiscussion ? 'discussion' : 'basic_comment';
    var commentNestedLevel = comment.parents('.s_comments_level').length;
    $(this).click(function(e){
      e.preventDefault();
      var commentReplyForm = $("#comment-reply-form-wrapper");

      if(commentReplyForm.is(':visible') && comment.has(commentReplyForm).length){
        toggleReplyForm(commentReplyForm, false, toolbar);
      }
      else{
        // move and show reply form
        toggleReplyForm(commentReplyForm, false, toolbar);

        if(pageIsAssignment || pageIsAssessment || isBlog){
          // the placement of the reply form on assignment page is different
          commentReplyForm.insertAfter(commentFooter);
        }
        else{
          // inside the footer if discussion
          commentReplyForm.appendTo(commentFooter);
        }
        $("input[type=hidden][name=pid]", commentReplyForm).val(comment.attr('id').split('-')[1]);
        $("input[type=hidden][name=nested_level]", commentReplyForm).val(commentNestedLevel + 1);
        toggleReplyForm(commentReplyForm, true, toolbar);
      }
    });
  });

  // Rendering after a reply
  if(context !== document) {
    sAttachActionLinkBehavior(context);
  } else {
    $('.discussion-content:not(.sComment-processed)', context).addClass('sComment-processed').each(function(){
      var commentsContainer = this;

      sAttachActionLinkBehavior(commentsContainer);

      $(document).on('popups_open_path_done', function(e, element, href, popup) {
        var activePopup = $('#' + popup.id);
        var popupEditId = '';
        // the attachment form is a singleton, move it to/from popup as needed
        if(activePopup.hasClass('s-js-comment-popup-edit')) {
          popupEditId = popup.id;
          $('#attachments', activePopup).remove();
          sAttachmentMoveForm( $('#s-comment-edit-comment-form') , '#edit-comment-body-wrapper' );

          $(document).bind('popups_before_remove',function(e, popup, nextPopup){
            if(popupEditId == popup.id) {
              sAttachmentMoveForm( $('#s-comments-post-comment-form') , '#edit-comment-wrapper' );
            }
          });
        }
      });
    });
  }

  $('#s-comment-edit-comment-form:not(.sComment-processed)', context).addClass('sComment-processed').each(function(){
    var thisForm = $(this);
    var editComment = $(".form-textarea", thisForm);
    var submitBtn = $('.form-submit', thisForm);
    var submitBtnWrapper = submitBtn.parent('.submit-span-wrapper:first', thisForm);

    editComment
      .elastic()
      .on('keyup', function(){
        var enableSave = editComment.val().length > 0 ? true : false;
        submitBtn.prop('disabled', !enableSave);
        submitBtnWrapper.toggleClass('disabled', !enableSave);
    });

    // update popup size on-elastic-update
    $(document).off('jq_elastic_update_done').on('jq_elastic_update_done', function(textarea, twin){
      sPopupsResizeCenter();
    });
  });

  $('#s_comments:not(.sComment-processed)', context).addClass('.sComment-processed').each(function(){
    var commentsWrapper = $(this);
    commentsWrapper.on('click', '.comment-more-toggle:not(.loading)', function(e){
      var linkObj = $(e.target);
      var commentID = linkObj.siblings('.comment-id').text();
      var moreWrapper = linkObj.closest('.comment-comment').find('.comment-more-wrapper');
      var lessWrapper = linkObj.closest('.comment-comment').find('.comment-less-wrapper');

      var performToggle = function(){
        var isLess = linkObj.hasClass('less');
        moreWrapper.toggleClass('hidden', isLess);
        lessWrapper.toggleClass('hidden', !isLess);

        // Store in Cookie
        var cookieName = 'collapsedTruncatedComment-' + commentID;
        var curCookie = $.cookie(cookieName);
        if(typeof curCookie == 'undefined' || !curCookie){
          curCookie = null;
        }
        curCookie = isLess;
        $.cookie(cookieName, curCookie, {expires : 30});
      };

      if(!linkObj.hasClass('comment-more-loading')) {
        if (!moreWrapper.length) {
          linkObj.addClass('comment-more-loading');
          $.ajax({
            url: '/comment/' + commentID + '/show_more',
            method: 'get',
            dataType: 'json',
            success: function (data) {
              lessWrapper.after($(data.comment));
              moreWrapper = linkObj.closest('.comment-comment').find('.comment-more-wrapper');
              performToggle();
              linkObj.removeClass('comment-more-loading');
            }
          });
        }
        else {
          linkObj.addClass('comment-more-loading');
          performToggle();
          linkObj.removeClass('comment-more-loading');
        }
      }
    });
  });

};

function sCommentEnableCommentJump(){

	$(".go-to-reply").click(function() {
		var clickedReplyLink = $(this);
		var el = $(this).parent().parent().parent().parent();
		if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') && location.hostname == this.hostname) {
			var target = $(this.hash);
			target.effect("highlight", {color: "#f9b974"}, 3000);

			// create a "return to post" link
			// remove other return-links
			$(".return-link").remove();
			var replyName = clickedReplyLink.parent().prev().text().split(' ');
			var returnLink = $('<div class="return-link">' + Drupal.t('Return to reply', {'@name': replyName[0]}) + '</div>');
			returnLink.click(function(){
				var replyOffset = clickedReplyLink.offset().top-20;
				$('html,body').animate({scrollTop: replyOffset}, 500);
				clickedReplyLink.parent().parent().parent().parent().effect("highlight", {color: "#f9b974"}, 3000);
				$(this).fadeOut();
			});
			target.prepend(returnLink);
			returnLink.fadeIn();

			target = target.length && target || $('[name=' + this.hash.slice(1) +']');
			if (target.length) {
				var targetOffset = target.offset().top-20;
				$('html,body').animate({scrollTop: targetOffset}, 500);
				return false;show
			}
		}
	});
}

function sCommentDeleteCallback(data, options, element){
  var isDiscussion = $(element.closest('.discussion-card')).length > 0;
  if(isDiscussion){
    location.reload();
    return false;
  }
  var newComment = Drupal.t('This comment has been deleted.');
  var markDeletion = function (element) {
    var comment = $(element).parents(".comment");
    comment.empty().addClass('deleted').append(newComment);
    if (comment.hasClass('no-children') && comment.parent().hasClass('discussion-card')) {
      comment.unwrap();
    }
  };

  if(typeof data.ajax_output != 'undefined'){
    newComment = data.ajax_output;
    markDeletion(element);
  }
  else{
    markDeletion(element);
  }


  // not sure this is right but it works
  var nextActivePopup = Popups.activePopup();
  if( nextActivePopup ) {
    Popups.removeLoading();
	nextActivePopup.show();
	nextActivePopup.refocus();
  } else {
    Popups.close();
  }

  return false;
}

function sCommentApproveCallback(data, options, element){
  $(element).parents(".comment").empty().addClass('deleted').append(Drupal.t('This comment has been approved.'));
  Popups.close();
  return false;
}

function sCommentEditCallback(data, options, element){
  var commentObj = data.content.comment;
  var commentEditedTs = data.content.comment_edited_timestamp;
  var commentAttachments = data.content.comment_attachments;

  var editLink = $(element);
  var commentWrapper = editLink.parents('#comment-' + commentObj.cid);
  var commentBodyWrapper = $('.comment-body-wrapper', commentWrapper);
  var commentTimeWrapper = $('.comment-time-wrapper', commentWrapper);
  var commentAttachmentWrapper = $('.comment-attachments', commentWrapper);

  if(commentObj.richtext && !commentBodyWrapper.hasClass('s-rte')) {
    commentBodyWrapper.addClass('s-rte');
  }

  if(typeof data.content.is_discussion != 'undefined' && data.content.is_discussion){
    commentBodyWrapper.replaceWith(commentObj.comment);
  }
  else{
    commentBodyWrapper.html(commentObj.comment);
    commentTimeWrapper.replaceWith(commentEditedTs);
  }
  if(commentAttachmentWrapper.length > 0) {
    commentAttachmentWrapper.replaceWith(commentAttachments);
  }
  else {
    $('.comment-comment', commentWrapper).append(commentAttachments);
  }

  sAttachBehaviors(['sCommonInfotip'], commentWrapper);

  Popups.close();
  return false;
}

function sAttachActionLinkBehavior(selectorContext) {
    $('.s-js-comment-wrapper:not(.has-action-link-behavior)', selectorContext).each(function(){
      $(this)
        .addClass('has-action-link-behavior')
        .sActionLinks({hidden: true, wrapper: '.s-js-comment-action-links', rowClass: '.comment-contents'});

    });
    sCommentAttachActions(selectorContext);
}


function sCommentAttachActions(commentsContainer) {
  var popups = {
    '.delete-comment': {extraClass: 'popups-small s-js-comment-popup-delete', updateMethod: 'callback', onUpdate: 'sCommentDeleteCallback', doneTest: '.+'},
    '.edit-comment': {extraClass: 'popups-medium s-js-comment-popup-edit', updateMethod: 'callback', onUpdate: 'sCommentEditCallback', hijackDestination: false, doneTest: '.+'}
  };

  $.each(popups, function (link, options) {
    $(commentsContainer).on('click', link, options, function(event){
      return Popups.clickPopupElement(this, Popups.options(event.data));
    });
  });
}

function sCommentScrollToNewComment(newComment, duration, bodySelector){
  var isDiscussion = $('body').hasClass('discussion-view'),
      targetOffset = newComment.offset().top,
      bodySelector = bodySelector || "",
      duration = duration || 750;

  if(isDiscussion){
    var outerHeight = 0,
        commentMargin = 20;
    $('.sticky-wrapper').each(function() {
      outerHeight += $(this).outerHeight();
    });
    targetOffset -= commentMargin;
    targetOffset -= outerHeight;
    bodySelector = "";
  }

  $('html, body' + bodySelector).animate({scrollTop: targetOffset}, duration);
}
;/**
 * Copyleft 2010-2011 Jay and Han (laughinghan@gmail.com)
 *   under the GNU Lesser General Public License
 *     http://www.gnu.org/licenses/lgpl.html
 * Project Website: http://mathquill.com
 *
 * @note v0.9.1
 *
 * 2013-3-22 removed single letter commands such as LatexCmds.C since they cause problems when parsing something like
 * \sqrt{C}. The parser will turn the C into a \complex which is not desirable
 * Commands affected: NPZQRCHoO
 * @see https://github.com/mathquill/mathquill/issues/164
 *
 */

(function() {

var $ = jQuery,
  undefined,
  _, //temp variable of prototypes
  mqCmdId = 'mathquill-command-id',
  mqBlockId = 'mathquill-block-id',
  min = Math.min,
  max = Math.max;

var __slice = [].slice;

function noop() {}

/**
 * sugar to make defining lots of commands easier.
 * TODO: rethink this.
 */
function bind(cons /*, args... */) {
  var args = __slice.call(arguments, 1);
  return function() {
    return cons.apply(this, args);
  };
}

/**
 * a development-only debug method.  This definition and all
 * calls to `pray` will be stripped from the minified
 * build of mathquill.
 *
 * This function must be called by name to be removed
 * at compile time.  Do not define another function
 * with the same name, and only call this function by
 * name.
 */
function pray(message, cond) {
  if (!cond) throw new Error('prayer failed: '+message);
}
var P = (function(prototype, ownProperty, undefined) {
  // helper functions that also help minification
  function isObject(o) { return typeof o === 'object'; }
  function isFunction(f) { return typeof f === 'function'; }

  function P(_superclass /* = Object */, definition) {
    // handle the case where no superclass is given
    if (definition === undefined) {
      definition = _superclass;
      _superclass = Object;
    }

    // C is the class to be returned.
    // There are three ways C will be called:
    //
    // 1) We call `new C` to create a new uninitialized object.
    //    The behavior is similar to Object.create, where the prototype
    //    relationship is set up, but the ::init method is not run.
    //    Note that in this case we have `this instanceof C`, so we don't
    //    spring the first trap. Also, `args` is undefined, so the initializer
    //    doesn't get run.
    //
    // 2) A user will simply call C(a, b, c, ...) to create a new object with
    //    initialization.  This allows the user to create objects without `new`,
    //    and in particular to initialize objects with variable arguments, which
    //    is impossible with the `new` keyword.  Note that in this case,
    //    !(this instanceof C) springs the return trap at the beginning, and
    //    C is called with the `new` keyword and one argument, which is the
    //    Arguments object passed in.
    //
    // 3) For internal use only, if new C(args) is called, where args is an
    //    Arguments object.  In this case, the presence of `new` means the
    //    return trap is not sprung, but the initializer is called if present.
    //
    //    You can also call `new C([a, b, c])`, which is equivalent to `C(a, b, c)`.
    //
    //  TODO: the Chrome inspector shows all created objects as `C` rather than `Object`.
    //        Setting the .name property seems to have no effect.  Is there a way to override
    //        this behavior?
    function C(args) {
      var self = this;
      if (!(self instanceof C)) return new C(arguments);
      if (args && isFunction(self.init)) self.init.apply(self, args);
    }

    // set up the prototype of the new class
    // note that this resolves to `new Object`
    // if the superclass isn't given
    var proto = C[prototype] = new _superclass();
    var _super = _superclass[prototype];
    var extensions;

    var mixin = C.mixin = function(def) {
      extensions = {};

      if (isFunction(def)) {
        // call the defining function with all the arguments you need
        // extensions captures the return value.
        extensions = def.call(C, proto, _super, C, _superclass);
      }
      else if (isObject(def)) {
        // if you passed an object instead, we'll take it
        extensions = def;
      }

      // ...and extend it
      if (isObject(extensions)) {
        for (var ext in extensions) {
          if (ownProperty.call(extensions, ext)) {
            proto[ext] = extensions[ext];
          }
        }
      }

      // if there's no init, we assume we're inheriting a non-pjs class, so
      // we default to applying the superclass's constructor.
      if (!isFunction(proto.init)) {
        proto.init = function() { _superclass.apply(this, arguments); };
      }

      return C;
    };

    // set the constructor property, for convenience
    proto.constructor = C;

    return mixin(definition);
  }

  // ship it
  return P;

  // as a minifier optimization, we've closured in a few helper functions
  // and the string 'prototype' (C[p] is much shorter than C.prototype)
})('prototype', ({}).hasOwnProperty);
/*************************************************
 * Textarea Manager
 *
 * An abstraction layer wrapping the textarea in
 * an object with methods to manipulate and listen
 * to events on, that hides all the nasty cross-
 * browser incompatibilities behind a uniform API.
 *
 * Design goal: This is a *HARD* internal
 * abstraction barrier. Cross-browser
 * inconsistencies are not allowed to leak through
 * and be dealt with by event handlers. All future
 * cross-browser issues that arise must be dealt
 * with here, and if necessary, the API updated.
 *
 * Organization:
 * - key values map and stringify()
 * - manageTextarea()
 *    + defer() and flush()
 *    + event handler logic
 *    + attach event handlers and export methods
 ************************************************/

var manageTextarea = (function() {
  // The following [key values][1] map was compiled from the
  // [DOM3 Events appendix section on key codes][2] and
  // [a widely cited report on cross-browser tests of key codes][3],
  // except for 10: 'Enter', which I've empirically observed in Safari on iOS
  // and doesn't appear to conflict with any other known key codes.
  //
  // [1]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#keys-keyvalues
  // [2]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#fixed-virtual-key-codes
  // [3]: http://unixpapa.com/js/key.html
  var KEY_VALUES = {
    8: 'Backspace',
    9: 'Tab',

    10: 'Enter', // for Safari on iOS

    13: 'Enter',

    16: 'Shift',
    17: 'Control',
    18: 'Alt',
    20: 'CapsLock',

    27: 'Esc',

    32: 'Spacebar',

    33: 'PageUp',
    34: 'PageDown',
    35: 'End',
    36: 'Home',

    37: 'Left',
    38: 'Up',
    39: 'Right',
    40: 'Down',

    45: 'Insert',

    46: 'Del',

    144: 'NumLock'
  };

  // To the extent possible, create a normalized string representation
  // of the key combo (i.e., key code and modifier keys).
  function stringify(evt) {
    var which = evt.which || evt.keyCode;
    var keyVal = KEY_VALUES[which];
    var key;
    var modifiers = [];

    if (evt.ctrlKey) modifiers.push('Ctrl');
    if (evt.originalEvent && evt.originalEvent.metaKey) modifiers.push('Meta');
    if (evt.altKey) modifiers.push('Alt');
    if (evt.shiftKey) modifiers.push('Shift');

    key = keyVal || String.fromCharCode(which);

    if (!modifiers.length && !keyVal) return key;

    modifiers.push(key);
    return modifiers.join('-');
  }

  // create a textarea manager that calls callbacks at useful times
  // and exports useful public methods
  return function manageTextarea(el, opts) {
    var keydown = null;
    var keypress = null;

    if (!opts) opts = {};
    var textCallback = opts.text || noop;
    var keyCallback = opts.key || noop;
    var pasteCallback = opts.paste || noop;
    var onCut = opts.cut || noop;

    var textarea = $(el);
    var target = $(opts.container || textarea);

    // defer() runs fn immediately after the current thread.
    // flush() will run it even sooner, if possible.
    // flush always needs to be called before defer, and is called a
    // few other places besides.
    var timeout, deferredFn;

    function defer(fn) {
      timeout = setTimeout(fn);
      deferredFn = fn;
    }

    function flush() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
        deferredFn();
      }
    }

    target.bind('keydown keypress input keyup focusout paste', flush);


    // -*- public methods -*- //
    function select(text) {
      flush();

      textarea.val(text);
      if (text) textarea[0].select();
    }

    // -*- helper subroutines -*- //

    // Determine whether there's a selection in the textarea.
    // This will always return false in IE < 9, which don't support
    // HTMLTextareaElement::selection{Start,End}.
    function hasSelection() {
      var dom = textarea[0];

      if (!('selectionStart' in dom)) return false;
      return dom.selectionStart !== dom.selectionEnd;
    }

    function popText(callback) {
      var text = textarea.val();
      textarea.val('');
      if (text) callback(text);
    }

    function handleKey() {
      keyCallback(stringify(keydown), keydown);
    }

    // -*- event handlers -*- //
    function onKeydown(e) {
      keydown = e;
      keypress = null;

      handleKey();
    }

    function onKeypress(e) {
      // call the key handler for repeated keypresses.
      // This excludes keypresses that happen directly
      // after keydown.  In that case, there will be
      // no previous keypress, so we skip it here
      if (keydown && keypress) handleKey();

      keypress = e;

      defer(function() {
        // If there is a selection, the contents of the textarea couldn't
        // possibly have just been typed in.
        // This happens in browsers like Firefox and Opera that fire
        // keypress for keystrokes that are not text entry and leave the
        // selection in the textarea alone, such as Ctrl-C.
        // Note: we assume that browsers that don't support hasSelection()
        // also never fire keypress on keystrokes that are not text entry.
        // This seems reasonably safe because:
        // - all modern browsers including IE 9+ support hasSelection(),
        //   making it extremely unlikely any browser besides IE < 9 won't
        // - as far as we know IE < 9 never fires keypress on keystrokes
        //   that aren't text entry, which is only as reliable as our
        //   tests are comprehensive, but the IE < 9 way to do
        //   hasSelection() is poorly documented and is also only as
        //   reliable as our tests are comprehensive
        // If anything like #40 or #71 is reported in IE < 9, see
        // b1318e5349160b665003e36d4eedd64101ceacd8
        if (hasSelection()) return;

        popText(textCallback);
      });
    }

    function onBlur() { keydown = keypress = null; }

    function onPaste(e) {
      // browsers are dumb.
      //
      // In Linux, middle-click pasting causes onPaste to be called,
      // when the textarea is not necessarily focused.  We focus it
      // here to ensure that the pasted text actually ends up in the
      // textarea.
      //
      // It's pretty nifty that by changing focus in this handler,
      // we can change the target of the default action.  (This works
      // on keydown too, FWIW).
      //
      // And by nifty, we mean dumb (but useful sometimes).
      textarea.focus();

      defer(function() {
        popText(pasteCallback);
      });
    }

    // -*- attach event handlers -*- //
    target.bind({
      keydown: onKeydown,
      keypress: onKeypress,
      focusout: onBlur,
      cut: onCut,
      paste: onPaste
    });

    // -*- export public methods -*- //
    return {
      select: select
    };
  };
}());
var Parser = P(function(_, _super, Parser) {
  // The Parser object is a wrapper for a parser function.
  // Externally, you use one to parse a string by calling
  //   var result = SomeParser.parse('Me Me Me! Parse Me!');
  // You should never call the constructor, rather you should
  // construct your Parser from the base parsers and the
  // parser combinator methods.

  function parseError(stream, message) {
    if (stream) {
      stream = "'"+stream+"'";
    }
    else {
      stream = 'EOF';
    }

    throw 'Parse Error: '+message+' at '+stream;
  }

  _.init = function(body) { this._ = body; };

  _.parse = function(stream) {
    return this.skip(eof)._(stream, success, parseError);

    function success(stream, result) { return result; }
  };

  // -*- primitive combinators -*- //
  _.or = function(alternative) {
    pray('or is passed a parser', alternative instanceof Parser);

    var self = this;

    return Parser(function(stream, onSuccess, onFailure) {
      return self._(stream, onSuccess, failure);

      function failure(newStream) {
        return alternative._(stream, onSuccess, onFailure);
      }
    });
  };

  _.then = function(next) {
    var self = this;

    return Parser(function(stream, onSuccess, onFailure) {
      return self._(stream, success, onFailure);

      function success(newStream, result) {
        var nextParser = (next instanceof Parser ? next : next(result));
        pray('a parser is returned', nextParser instanceof Parser);
        return nextParser._(newStream, onSuccess, onFailure);
      }
    });
  };

  // -*- optimized iterative combinators -*- //
  _.many = function() {
    var self = this;

    return Parser(function(stream, onSuccess, onFailure) {
      var xs = [];
      while (self._(stream, success, failure));
      return onSuccess(stream, xs);

      function success(newStream, x) {
        stream = newStream;
        xs.push(x);
        return true;
      }

      function failure() {
        return false;
      }
    });
  };

  _.times = function(min, max) {
    if (arguments.length < 2) max = min;
    var self = this;

    return Parser(function(stream, onSuccess, onFailure) {
      var xs = [];
      var result = true;
      var failure;

      for (var i = 0; i < min; i += 1) {
        result = self._(stream, success, firstFailure);
        if (!result) return onFailure(stream, failure);
      }

      for (; i < max && result; i += 1) {
        result = self._(stream, success, secondFailure);
      }

      return onSuccess(stream, xs);

      function success(newStream, x) {
        xs.push(x);
        stream = newStream;
        return true;
      }

      function firstFailure(newStream, msg) {
        failure = msg;
        stream = newStream;
        return false;
      }

      function secondFailure(newStream, msg) {
        return false;
      }
    });
  };

  // -*- higher-level combinators -*- //
  _.result = function(res) { return this.then(succeed(res)); };
  _.atMost = function(n) { return this.times(0, n); };
  _.atLeast = function(n) {
    var self = this;
    return self.times(n).then(function(start) {
      return self.many().map(function(end) {
        return start.concat(end);
      });
    });
  };

  _.map = function(fn) {
    return this.then(function(result) { return succeed(fn(result)); });
  };

  _.skip = function(two) {
    return this.then(function(result) { return two.result(result); });
  };

  // -*- primitive parsers -*- //
  var string = this.string = function(str) {
    var len = str.length;
    var expected = "expected '"+str+"'";

    return Parser(function(stream, onSuccess, onFailure) {
      var head = stream.slice(0, len);

      if (head === str) {
        return onSuccess(stream.slice(len), head);
      }
      else {
        return onFailure(stream, expected);
      }
    });
  };

  var regex = this.regex = function(re) {
    pray('regexp parser is anchored', re.toString().charAt(1) === '^');

    var expected = 'expected '+re;

    return Parser(function(stream, onSuccess, onFailure) {
      var match = re.exec(stream);

      if (match) {
        var result = match[0];
        return onSuccess(stream.slice(result.length), result);
      }
      else {
        return onFailure(stream, expected);
      }
    });
  };

  var succeed = Parser.succeed = function(result) {
    return Parser(function(stream, onSuccess) {
      return onSuccess(stream, result);
    });
  };

  var fail = Parser.fail = function(msg) {
    return Parser(function(stream, _, onFailure) {
      return onFailure(stream, msg);
    });
  };

  var letter = Parser.letter = regex(/^[a-z]/i);
  var letters = Parser.letters = regex(/^[a-z]*/i);
  var digit = Parser.digit = regex(/^[0-9]/);
  var digits = Parser.digits = regex(/^[0-9]*/);
  var whitespace = Parser.whitespace = regex(/^\s+/);
  var optWhitespace = Parser.optWhitespace = regex(/^\s*/);

  var any = Parser.any = Parser(function(stream, onSuccess, onFailure) {
    if (!stream) return onFailure(stream, 'expected any character');

    return onSuccess(stream.slice(1), stream.charAt(0));
  });

  var all = Parser.all = Parser(function(stream, onSuccess, onFailure) {
    return onSuccess('', stream);
  });

  var eof = Parser.eof = Parser(function(stream, onSuccess, onFailure) {
    if (stream) return onFailure(stream, 'expected EOF');

    return onSuccess(stream, stream);
  });
});
/*************************************************
 * Base classes of the MathQuill virtual DOM tree
 *
 * Only doing tree node manipulation via these
 * adopt/ disown methods guarantees well-formedness
 * of the tree.
 ************************************************/

/**
 * MathQuill virtual-DOM tree-node abstract base class
 */
var Node = P(function(_) {
  _.prev = 0;
  _.next = 0;
  _.parent = 0;
  _.firstChild = 0;
  _.lastChild = 0;

  _.children = function() {
    return Fragment(this.firstChild, this.lastChild);
  };

  _.eachChild = function(fn) {
    return this.children().each(fn);
  };

  _.foldChildren = function(fold, fn) {
    return this.children().fold(fold, fn);
  };

  _.adopt = function(parent, prev, next) {
    Fragment(this, this).adopt(parent, prev, next);
    return this;
  };

  _.disown = function() {
    Fragment(this, this).disown();
    return this;
  };
});

/**
 * An entity outside the virtual tree with one-way pointers (so it's only a
 * "view" of part of the tree, not an actual node/entity in the tree) that
 * delimits a doubly-linked list of sibling nodes.
 * It's like a fanfic love-child between HTML DOM DocumentFragment and the Range
 * classes: like DocumentFragment, its contents must be sibling nodes
 * (unlike Range, whose contents are arbitrary contiguous pieces of subtrees),
 * but like Range, it has only one-way pointers to its contents, its contents
 * have no reference to it and in fact may still be in the visible tree (unlike
 * DocumentFragment, whose contents must be detached from the visible tree
 * and have their 'parent' pointers set to the DocumentFragment).
 */
var Fragment = P(function(_) {
  _.first = 0;
  _.last = 0;

  _.init = function(first, last) {
    pray('no half-empty fragments', !first === !last);

    if (!first) return;

    pray('first node is passed to Fragment', first instanceof Node);
    pray('last node is passed to Fragment', last instanceof Node);
    pray('first and last have the same parent',
         first.parent === last.parent);

    this.first = first;
    this.last = last;
  };

  function prayWellFormed(parent, prev, next) {
    pray('a parent is always present', parent);
    pray('prev is properly set up', (function() {
      // either it's empty and next is the first child (possibly empty)
      if (!prev) return parent.firstChild === next;

      // or it's there and its next and parent are properly set up
      return prev.next === next && prev.parent === parent;
    })());

    pray('next is properly set up', (function() {
      // either it's empty and prev is the last child (possibly empty)
      if (!next) return parent.lastChild === prev;

      // or it's there and its next and parent are properly set up
      return next.prev === prev && next.parent === parent;
    })());
  }

  _.adopt = function(parent, prev, next) {
    prayWellFormed(parent, prev, next);

    var self = this;
    self.disowned = false;

    var first = self.first;
    if (!first) return this;

    var last = self.last;

    if (prev) {
      // NB: this is handled in the ::each() block
      // prev.next = first
    } else {
      parent.firstChild = first;
    }

    if (next) {
      next.prev = last;
    } else {
      parent.lastChild = last;
    }

    self.last.next = next;

    self.each(function(el) {
      el.prev = prev;
      el.parent = parent;
      if (prev) prev.next = el;

      prev = el;
    });

    return self;
  };

  _.disown = function() {
    var self = this;
    var first = self.first;

    // guard for empty and already-disowned fragments
    if (!first || self.disowned) return self;

    self.disowned = true;

    var last = self.last;
    var parent = first.parent;

    prayWellFormed(parent, first.prev, first);
    prayWellFormed(parent, last, last.next);

    if (first.prev) {
      first.prev.next = last.next;
    } else {
      parent.firstChild = last.next;
    }

    if (last.next) {
      last.next.prev = first.prev;
    } else {
      parent.lastChild = first.prev;
    }

    return self;
  };

  _.each = function(fn) {
    var self = this;
    var el = self.first;
    if (!el) return self;

    for (;el !== self.last.next; el = el.next) {
      if (fn.call(self, el) === false) break;
    }

    return self;
  };

  _.fold = function(fold, fn) {
    this.each(function(el) {
      fold = fn.call(this, fold, el);
    });

    return fold;
  };
});
/*************************************************
 * Abstract classes of math blocks and commands.
 ************************************************/

var uuid = (function() {
  var id = 0;

  return function() { return id += 1; };
})();

/**
 * Math tree node base class.
 * Some math-tree-specific extensions to Node.
 * Both MathBlock's and MathCommand's descend from it.
 */
var MathElement = P(Node, function(_) {
  _.init = function(obj) {
    this.id = uuid();
    MathElement[this.id] = this;
  };

  _.toString = function() {
    return '[MathElement '+this.id+']';
  };

  _.bubble = function(event /*, args... */) {
    var args = __slice.call(arguments, 1);

    for (var ancestor = this; ancestor; ancestor = ancestor.parent) {
      var res = ancestor[event] && ancestor[event].apply(ancestor, args);
      if (res === false) break;
    }

    return this;
  };

  _.postOrder = function(fn /*, args... */) {
    var args = __slice.call(arguments, 1);

    if (typeof fn === 'string') {
      var methodName = fn;
      fn = function(el) {
        if (methodName in el) el[methodName].apply(el, arguments);
      };
    }

    (function recurse(desc) {
      desc.eachChild(recurse);
      fn(desc);
    })(this);
  };

  _.jQ = $();
  _.jQadd = function(jQ) { this.jQ = this.jQ.add(jQ); };

  this.jQize = function(html) {
    // Sets the .jQ of the entire math subtree rooted at this command.
    // Expects .createBlocks() to have been called already, since it
    // calls .html().
    var jQ = $(html);
    jQ.find('*').andSelf().each(function() {
      var jQ = $(this),
        cmdId = jQ.attr('mathquill-command-id'),
        blockId = jQ.attr('mathquill-block-id');
      if (cmdId) MathElement[cmdId].jQadd(jQ);
      if (blockId) MathElement[blockId].jQadd(jQ);
    });
    return jQ;
  };

  _.finalizeInsert = function() {
    var self = this;
    self.postOrder('finalizeTree');

    // note: this order is important.
    // empty elements need the empty box provided by blur to
    // be present in order for their dimensions to be measured
    // correctly in redraw.
    self.postOrder('blur');

    // adjust context-sensitive spacing
    self.postOrder('respace');
    if (self.next.respace) self.next.respace();
    if (self.prev.respace) self.prev.respace();

    self.postOrder('redraw');
    self.bubble('redraw');
  };
});

/**
 * Commands and operators, like subscripts, exponents, or fractions.
 * Descendant commands are organized into blocks.
 */
var MathCommand = P(MathElement, function(_, _super) {
  _.init = function(ctrlSeq, htmlTemplate, textTemplate) {
    var cmd = this;
    _super.init.call(cmd);

    if (!cmd.ctrlSeq) cmd.ctrlSeq = ctrlSeq;
    if (htmlTemplate) cmd.htmlTemplate = htmlTemplate;
    if (textTemplate) cmd.textTemplate = textTemplate;
  };

  // obvious methods
  _.replaces = function(replacedFragment) {
    replacedFragment.disown();
    this.replacedFragment = replacedFragment;
  };
  _.isEmpty = function() {
    return this.foldChildren(true, function(isEmpty, child) {
      return isEmpty && child.isEmpty();
    });
  };

  _.parser = function() {
    var block = latexMathParser.block;
    var self = this;

    return block.times(self.numBlocks()).map(function(blocks) {
      self.blocks = blocks;

      for (var i = 0; i < blocks.length; i += 1) {
        blocks[i].adopt(self, self.lastChild, 0);
      }

      return self;
    });
  };

  // createBefore(cursor) and the methods it calls
  _.createBefore = function(cursor) {
    var cmd = this;
    var replacedFragment = cmd.replacedFragment;

    cmd.createBlocks();
    MathElement.jQize(cmd.html());
    if (replacedFragment) {
      replacedFragment.adopt(cmd.firstChild, 0, 0);
      replacedFragment.jQ.appendTo(cmd.firstChild.jQ);
    }

    cursor.jQ.before(cmd.jQ);
    cursor.prev = cmd.adopt(cursor.parent, cursor.prev, cursor.next);

    cmd.finalizeInsert(cursor);

    cmd.placeCursor(cursor);
  };
  _.createBlocks = function() {
    var cmd = this,
      numBlocks = cmd.numBlocks(),
      blocks = cmd.blocks = Array(numBlocks);

    for (var i = 0; i < numBlocks; i += 1) {
      var newBlock = blocks[i] = MathBlock();
      newBlock.adopt(cmd, cmd.lastChild, 0);
    }
  };
  _.respace = noop; //placeholder for context-sensitive spacing
  _.placeCursor = function(cursor) {
    //append the cursor to the first empty child, or if none empty, the last one
    cursor.appendTo(this.foldChildren(this.firstChild, function(prev, child) {
      return prev.isEmpty() ? prev : child;
    }));
  };

  // remove()
  _.remove = function() {
    this.disown()
    this.jQ.remove();

    this.postOrder(function(el) { delete MathElement[el.id]; });

    return this;
  };

  // methods involved in creating and cross-linking with HTML DOM nodes
  /*
    They all expect an .htmlTemplate like
      '<span>&0</span>'
    or
      '<span><span>&0</span><span>&1</span></span>'

    See html.test.js for more examples.

    Requirements:
    - For each block of the command, there must be exactly one "block content
      marker" of the form '&<number>' where <number> is the 0-based index of the
      block. (Like the LaTeX \newcommand syntax, but with a 0-based rather than
      1-based index, because JavaScript because C because Dijkstra.)
    - The block content marker must be the sole contents of the containing
      element, there can't even be surrounding whitespace, or else we can't
      guarantee sticking to within the bounds of the block content marker when
      mucking with the HTML DOM.
    - The HTML not only must be well-formed HTML (of course), but also must
      conform to the XHTML requirements on tags, specifically all tags must
      either be self-closing (like '<br/>') or come in matching pairs.
      Close tags are never optional.

    Note that &<number> isn't well-formed HTML; if you wanted a literal '&123',
    your HTML template would have to have '&amp;123'.
  */
  _.numBlocks = function() {
    var matches = this.htmlTemplate.match(/&\d+/g);
    return matches ? matches.length : 0;
  };
  _.html = function() {
    // Render the entire math subtree rooted at this command, as HTML.
    // Expects .createBlocks() to have been called already, since it uses the
    // .blocks array of child blocks.
    //
    // See html.test.js for example templates and intended outputs.
    //
    // Given an .htmlTemplate as described above,
    // - insert the mathquill-command-id attribute into all top-level tags,
    //   which will be used to set this.jQ in .jQize().
    //   This is straightforward:
    //     * tokenize into tags and non-tags
    //     * loop through top-level tokens:
    //         * add #cmdId attribute macro to top-level self-closing tags
    //         * else add #cmdId attribute macro to top-level open tags
    //             * skip the matching top-level close tag and all tag pairs
    //               in between
    // - for each block content marker,
    //     + replace it with the contents of the corresponding block,
    //       rendered as HTML
    //     + insert the mathquill-block-id attribute into the containing tag
    //   This is even easier, a quick regex replace, since block tags cannot
    //   contain anything besides the block content marker.
    //
    // Two notes:
    // - The outermost loop through top-level tokens should never encounter any
    //   top-level close tags, because we should have first encountered a
    //   matching top-level open tag, all inner tags should have appeared in
    //   matching pairs and been skipped, and then we should have skipped the
    //   close tag in question.
    // - All open tags should have matching close tags, which means our inner
    //   loop should always encounter a close tag and drop nesting to 0. If
    //   a close tag is missing, the loop will continue until i >= tokens.length
    //   and token becomes undefined. This will not infinite loop, even in
    //   production without pray(), because it will then TypeError on .slice().

    var cmd = this;
    var blocks = cmd.blocks;
    var cmdId = ' mathquill-command-id=' + cmd.id;
    var tokens = cmd.htmlTemplate.match(/<[^<>]+>|[^<>]+/g);

    pray('no unmatched angle brackets', tokens.join('') === this.htmlTemplate);

    // add cmdId to all top-level tags
    for (var i = 0, token = tokens[0]; token; i += 1, token = tokens[i]) {
      // top-level self-closing tags
      if (token.slice(-2) === '/>') {
        tokens[i] = token.slice(0,-2) + cmdId + '/>';
      }
      // top-level open tags
      else if (token.charAt(0) === '<') {
        pray('not an unmatched top-level close tag', token.charAt(1) !== '/');

        tokens[i] = token.slice(0,-1) + cmdId + '>';

        // skip matching top-level close tag and all tag pairs in between
        var nesting = 1;
        do {
          i += 1, token = tokens[i];
          pray('no missing close tags', token);
          // close tags
          if (token.slice(0,2) === '</') {
            nesting -= 1;
          }
          // non-self-closing open tags
          else if (token.charAt(0) === '<' && token.slice(-2) !== '/>') {
            nesting += 1;
          }
        } while (nesting > 0);
      }
    }
    return tokens.join('').replace(/>&(\d+)/g, function($0, $1) {
      return ' mathquill-block-id=' + blocks[$1].id + '>' + blocks[$1].join('html');
    });
  };

  // methods to export a string representation of the math tree
  _.latex = function() {
    return this.foldChildren(this.ctrlSeq, function(latex, child) {
      return latex + '{' + (child.latex() || ' ') + '}';
    });
  };
  _.textTemplate = [''];
  _.text = function() {
    var i = 0;
    return this.foldChildren(this.textTemplate[i], function(text, child) {
      i += 1;
      var child_text = child.text();
      if (text && this.textTemplate[i] === '('
          && child_text[0] === '(' && child_text.slice(-1) === ')')
        return text + child_text.slice(1, -1) + this.textTemplate[i];
      return text + child.text() + (this.textTemplate[i] || '');
    });
  };
});

/**
 * Lightweight command without blocks or children.
 */
var Symbol = P(MathCommand, function(_, _super) {
  _.init = function(ctrlSeq, html, text) {
    if (!text) text = ctrlSeq && ctrlSeq.length > 1 ? ctrlSeq.slice(1) : ctrlSeq;

    _super.init.call(this, ctrlSeq, html, [ text ]);
  };

  _.parser = function() { return Parser.succeed(this); };
  _.numBlocks = function() { return 0; };

  _.replaces = function(replacedFragment) {
    replacedFragment.remove();
  };
  _.createBlocks = noop;
  _.latex = function(){ return this.ctrlSeq; };
  _.text = function(){ return this.textTemplate; };
  _.placeCursor = noop;
  _.isEmpty = function(){ return true; };
});

/**
 * Children and parent of MathCommand's. Basically partitions all the
 * symbols and operators that descend (in the Math DOM tree) from
 * ancestor operators.
 */
var MathBlock = P(MathElement, function(_) {
  _.join = function(methodName) {
    return this.foldChildren('', function(fold, child) {
      return fold + child[methodName]();
    });
  };
  _.latex = function() { return this.join('latex'); };
  _.text = function() {
    return this.firstChild === this.lastChild ?
      this.firstChild.text() :
      '(' + this.join('text') + ')'
    ;
  };
  _.isEmpty = function() {
    return this.firstChild === 0 && this.lastChild === 0;
  };
  _.focus = function() {
    this.jQ.addClass('hasCursor');
    this.jQ.removeClass('empty');

    return this;
  };
  _.blur = function() {
    this.jQ.removeClass('hasCursor');
    if (this.isEmpty())
      this.jQ.addClass('empty');

    return this;
  };
});

/**
 * Math tree fragment base class.
 * Some math-tree-specific extensions to Fragment.
 */
var MathFragment = P(Fragment, function(_, _super) {
  _.init = function(first, last) {
    // just select one thing if only one argument
    _super.init.call(this, first, last || first);
    this.jQ = this.fold($(), function(jQ, child){ return child.jQ.add(jQ); });
  };
  _.latex = function() {
    return this.fold('', function(latex, el){ return latex + el.latex(); });
  };
  _.remove = function() {
    this.jQ.remove();

    this.each(function(el) {
      el.postOrder(function(desc) {
        delete MathElement[desc.id];
      });
    });

    return this.disown();
  };
});
/*********************************************
 * Root math elements with event delegation.
 ********************************************/

function createRoot(jQ, root, textbox, editable) {
  var contents = jQ.contents().detach();

  if (!textbox) {
    jQ.addClass('mathquill-rendered-math');
  }

  root.jQ = jQ.attr(mqBlockId, root.id);
  root.revert = function() {
    jQ.empty().unbind('.mathquill')
      .removeClass('mathquill-rendered-math mathquill-editable mathquill-textbox')
      .append(contents);
  };

  var cursor = root.cursor = Cursor(root);

  root.renderLatex(contents.text());

  //textarea stuff
  var textareaSpan = root.textarea = $('<span class="textarea"><textarea></textarea></span>'),
    textarea = textareaSpan.children();

  /******
   * TODO [Han]: Document this
   */
  var textareaSelectionTimeout;
  root.selectionChanged = function() {
    if (textareaSelectionTimeout === undefined) {
      textareaSelectionTimeout = setTimeout(setTextareaSelection);
    }
    forceIERedraw(jQ[0]);
  };
  function setTextareaSelection() {
    textareaSelectionTimeout = undefined;
    var latex = cursor.selection ? '$'+cursor.selection.latex()+'$' : '';
    textareaManager.select(latex);
  }

  //prevent native selection except textarea
  jQ.bind('selectstart.mathquill', function(e) {
    if (e.target !== textarea[0]) e.preventDefault();
    e.stopPropagation();
  });

  //drag-to-select event handling
  var anticursor, blink = cursor.blink;
  jQ.bind('mousedown.mathquill', function(e) {
    function mousemove(e) {
      cursor.seek($(e.target), e.pageX, e.pageY);

      if (cursor.prev !== anticursor.prev
          || cursor.parent !== anticursor.parent) {
        cursor.selectFrom(anticursor);
      }

      return false;
    }

    // docmousemove is attached to the document, so that
    // selection still works when the mouse leaves the window.
    function docmousemove(e) {
      // [Han]: i delete the target because of the way seek works.
      // it will not move the mouse to the target, but will instead
      // just seek those X and Y coordinates.  If there is a target,
      // it will try to move the cursor to document, which will not work.
      // cursor.seek needs to be refactored.
      delete e.target;

      return mousemove(e);
    }

    function mouseup(e) {
      anticursor = undefined;
      cursor.blink = blink;
      if (!cursor.selection) {
        if (editable) {
          cursor.show();
        }
        else {
          textareaSpan.detach();
        }
      }

      // delete the mouse handlers now that we're not dragging anymore
      jQ.unbind('mousemove', mousemove);
      $(e.target.ownerDocument).unbind('mousemove', docmousemove).unbind('mouseup', mouseup);
    }

    setTimeout(function() { textarea.focus(); });
      // preventDefault won't prevent focus on mousedown in IE<9
      // that means immediately after this mousedown, whatever was
      // mousedown-ed will receive focus
      // http://bugs.jquery.com/ticket/10345

    cursor.blink = noop;
    cursor.seek($(e.target), e.pageX, e.pageY);

    anticursor = {parent: cursor.parent, prev: cursor.prev, next: cursor.next};

    if (!editable) jQ.prepend(textareaSpan);

    jQ.mousemove(mousemove);
    $(e.target.ownerDocument).mousemove(docmousemove).mouseup(mouseup);

    return false;
  });

  if (!editable) {
    var textareaManager = manageTextarea(textarea, { container: jQ });
    jQ.bind('cut paste', false).bind('copy', setTextareaSelection)
      .prepend('<span class="selectable">$'+root.latex()+'$</span>');
    textarea.blur(function() {
      cursor.clearSelection();
      setTimeout(detach); //detaching during blur explodes in WebKit
    });
    function detach() {
      textareaSpan.detach();
    }
    return;
  }

  var textareaManager = manageTextarea(textarea, {
    container: jQ,
    key: function(key, evt) {
      cursor.parent.bubble('onKey', key, evt);
    },
    text: function(text) {
      cursor.parent.bubble('onText', text);
    },
    cut: function(e) {
      if (cursor.selection) {
        setTimeout(function() {
          cursor.prepareEdit();
          cursor.parent.bubble('redraw');
        });
      }

      e.stopPropagation();
    },
    paste: function(text) {
      // FIXME HACK the parser in RootTextBlock needs to be moved to
      // Cursor::writeLatex or something so this'll work with
      // MathQuill textboxes
      if (text.slice(0,1) === '$' && text.slice(-1) === '$') {
        text = text.slice(1, -1);
      }
      else {
        text = '\\text{' + text + '}';
      }

      cursor.writeLatex(text).show();
    }
  });

  jQ.prepend(textareaSpan);

  //root CSS classes
  jQ.addClass('mathquill-editable');
  if (textbox)
    jQ.addClass('mathquill-textbox');

  //focus and blur handling
  textarea.focus(function(e) {
    if (!cursor.parent)
      cursor.appendTo(root);
    cursor.parent.jQ.addClass('hasCursor');
    if (cursor.selection) {
      cursor.selection.jQ.removeClass('blur');
      setTimeout(root.selectionChanged); //re-select textarea contents after tabbing away and back
    }
    else
      cursor.show();
    e.stopPropagation();
  }).blur(function(e) {
    cursor.hide().parent.blur();
    if (cursor.selection)
      cursor.selection.jQ.addClass('blur');
    e.stopPropagation();
  });

  jQ.bind('focus.mathquill blur.mathquill', function(e) {
    textarea.trigger(e);
  }).blur();
}

var RootMathBlock = P(MathBlock, function(_, _super) {
  _.latex = function() {
    return _super.latex.call(this).replace(/(\\[a-z]+) (?![a-z])/ig,'$1');
  };
  _.text = function() {
    return this.foldChildren('', function(text, child) {
      return text + child.text();
    });
  };
  _.renderLatex = function(latex) {
    var jQ = this.jQ;

    jQ.children().slice(1).remove();
    this.firstChild = this.lastChild = 0;

    this.cursor.appendTo(this).writeLatex(latex);
  };
  _.onKey = function(key, e) {
    switch (key) {
    case 'Ctrl-Shift-Backspace':
    case 'Ctrl-Backspace':
      while (this.cursor.prev || this.cursor.selection) {
        this.cursor.backspace();
      }
      break;

    case 'Shift-Backspace':
    case 'Backspace':
      this.cursor.backspace();
      break;

    // Tab or Esc -> go one block right if it exists, else escape right.
    case 'Esc':
    case 'Tab':
    case 'Spacebar':
      var parent = this.cursor.parent;
      // cursor is in root editable, continue default
      if (parent === this.cursor.root) {
        if (key === 'Spacebar') e.preventDefault();
        return;
      }

      this.cursor.prepareMove();
      if (parent.next) {
        // go one block right
        this.cursor.prependTo(parent.next);
      } else {
        // get out of the block
        this.cursor.insertAfter(parent.parent);
      }
      break;

    // Shift-Tab -> go one block left if it exists, else escape left.
    case 'Shift-Tab':
    case 'Shift-Esc':
    case 'Shift-Spacebar':
      var parent = this.cursor.parent;
      //cursor is in root editable, continue default
      if (parent === this.cursor.root) {
        if (key === 'Shift-Spacebar') e.preventDefault();
        return;
      }

      this.cursor.prepareMove();
      if (parent.prev) {
        // go one block left
        this.cursor.appendTo(parent.prev);
      } else {
        //get out of the block
        this.cursor.insertBefore(parent.parent);
      }
      break;

    // Prevent newlines from showing up
    case 'Enter': break;


    // End -> move to the end of the current block.
    case 'End':
      this.cursor.prepareMove().appendTo(this.cursor.parent);
      break;

    // Ctrl-End -> move all the way to the end of the root block.
    case 'Ctrl-End':
      this.cursor.prepareMove().appendTo(this);
      break;

    // Shift-End -> select to the end of the current block.
    case 'Shift-End':
      while (this.cursor.next) {
        this.cursor.selectRight();
      }
      break;

    // Ctrl-Shift-End -> select to the end of the root block.
    case 'Ctrl-Shift-End':
      while (this.cursor.next || this.cursor.parent !== this) {
        this.cursor.selectRight();
      }
      break;

    // Home -> move to the start of the root block or the current block.
    case 'Home':
      this.cursor.prepareMove().prependTo(this.cursor.parent);
      break;

    // Ctrl-Home -> move to the start of the current block.
    case 'Ctrl-Home':
      this.cursor.prepareMove().prependTo(this);
      break;

    // Shift-Home -> select to the start of the current block.
    case 'Shift-Home':
      while (this.cursor.prev) {
        this.cursor.selectLeft();
      }
      break;

    // Ctrl-Shift-Home -> move to the start of the root block.
    case 'Ctrl-Shift-Home':
      while (this.cursor.prev || this.cursor.parent !== this) {
        this.cursor.selectLeft();
      }
      break;

    case 'Left': this.cursor.moveLeft(); break;
    case 'Shift-Left': this.cursor.selectLeft(); break;
    case 'Ctrl-Left': break;

    case 'Right': this.cursor.moveRight(); break;
    case 'Shift-Right': this.cursor.selectRight(); break;
    case 'Ctrl-Right': break;

    case 'Up': this.cursor.moveUp(); break;
    case 'Down': this.cursor.moveDown(); break;

    case 'Shift-Up':
      if (this.cursor.prev) {
        while (this.cursor.prev) this.cursor.selectLeft();
      } else {
        this.cursor.selectLeft();
      }

    case 'Shift-Down':
      if (this.cursor.next) {
        while (this.cursor.next) this.cursor.selectRight();
      }
      else {
        this.cursor.selectRight();
      }

    case 'Ctrl-Up': break;
    case 'Ctrl-Down': break;

    case 'Ctrl-Shift-Del':
    case 'Ctrl-Del':
      while (this.cursor.next || this.cursor.selection) {
        this.cursor.deleteForward();
      }
      break;

    case 'Shift-Del':
    case 'Del':
      this.cursor.deleteForward();
      break;

    case 'Meta-A':
    case 'Ctrl-A':
      //so not stopPropagation'd at RootMathCommand
      if (this !== this.cursor.root) return;

      this.cursor.prepareMove().appendTo(this);
      while (this.cursor.prev) this.cursor.selectLeft();
      break;

    default:
      return false;
    }
    e.preventDefault();
    return false;
  };
  _.onText = function(ch) {
    this.cursor.write(ch);
    return false;
  };
});

var RootMathCommand = P(MathCommand, function(_, _super) {
  _.init = function(cursor) {
    _super.init.call(this, '$');
    this.cursor = cursor;
  };
  _.htmlTemplate = '<span class="mathquill-rendered-math">&0</span>';
  _.createBlocks = function() {
    this.firstChild =
    this.lastChild =
      RootMathBlock();

    this.blocks = [ this.firstChild ];

    this.firstChild.parent = this;

    var cursor = this.firstChild.cursor = this.cursor;
    this.firstChild.onText = function(ch) {
      if (ch !== '$' || cursor.parent !== this)
        cursor.write(ch);
      else if (this.isEmpty()) {
        cursor.insertAfter(this.parent).backspace()
          .insertNew(VanillaSymbol('\\$','$')).show();
      }
      else if (!cursor.next)
        cursor.insertAfter(this.parent);
      else if (!cursor.prev)
        cursor.insertBefore(this.parent);
      else
        cursor.write(ch);

      return false;
    };
  };
  _.latex = function() {
    return '$' + this.firstChild.latex() + '$';
  };
});

var RootTextBlock = P(MathBlock, function(_) {
  _.renderLatex = function(latex) {
    var self = this
    var cursor = self.cursor;
    self.jQ.children().slice(1).remove();
    self.firstChild = self.lastChild = 0;
    cursor.show().appendTo(self);

    var regex = Parser.regex;
    var string = Parser.string;
    var eof = Parser.eof;
    var all = Parser.all;

    // Parser RootMathCommand
    var mathMode = string('$').then(latexMathParser)
      // because TeX is insane, math mode doesn't necessarily
      // have to end.  So we allow for the case that math mode
      // continues to the end of the stream.
      .skip(string('$').or(eof))
      .map(function(block) {
        // HACK FIXME: this shouldn't have to have access to cursor
        var rootMathCommand = RootMathCommand(cursor);

        rootMathCommand.createBlocks();
        var rootMathBlock = rootMathCommand.firstChild;
        block.children().adopt(rootMathBlock, 0, 0);

        return rootMathCommand;
      })
    ;

    var escapedDollar = string('\\$').result('$');
    var textChar = escapedDollar.or(regex(/^[^$]/)).map(VanillaSymbol);
    var latexText = mathMode.or(textChar).many();
    var commands = latexText.skip(eof).or(all.result(false)).parse(latex);

    if (commands) {
      for (var i = 0; i < commands.length; i += 1) {
        commands[i].adopt(self, self.lastChild, 0);
      }

      var html = self.join('html');
      MathElement.jQize(html).appendTo(self.jQ);

      this.finalizeInsert();
    }
  };
  _.onKey = RootMathBlock.prototype.onKey;
  _.onText = function(ch) {
    this.cursor.prepareEdit();
    if (ch === '$')
      this.cursor.insertNew(RootMathCommand(this.cursor));
    else
      this.cursor.insertNew(VanillaSymbol(ch));

    return false;
  };
});
/***************************
 * Commands and Operators.
 **************************/

var CharCmds = {}, LatexCmds = {}; //single character commands, LaTeX commands

var scale, // = function(jQ, x, y) { ... }
//will use a CSS 2D transform to scale the jQuery-wrapped HTML elements,
//or the filter matrix transform fallback for IE 5.5-8, or gracefully degrade to
//increasing the fontSize to match the vertical Y scaling factor.

//ideas from http://github.com/louisremi/jquery.transform.js
//see also http://msdn.microsoft.com/en-us/library/ms533014(v=vs.85).aspx

  forceIERedraw = noop,
  div = document.createElement('div'),
  div_style = div.style,
  transformPropNames = {
    transform:1,
    WebkitTransform:1,
    MozTransform:1,
    OTransform:1,
    msTransform:1
  },
  transformPropName;

for (var prop in transformPropNames) {
  if (prop in div_style) {
    transformPropName = prop;
    break;
  }
}

if (transformPropName) {
  scale = function(jQ, x, y) {
    jQ.css(transformPropName, 'scale('+x+','+y+')');
  };
}
else if ('filter' in div_style) { //IE 6, 7, & 8 fallback, see https://github.com/laughinghan/mathquill/wiki/Transforms
  forceIERedraw = function(el){ el.className = el.className; };
  scale = function(jQ, x, y) { //NOTE: assumes y > x
    x /= (1+(y-1)/2);
    jQ.css('fontSize', y + 'em');
    if (!jQ.hasClass('matrixed-container')) {
      jQ.addClass('matrixed-container')
      .wrapInner('<span class="matrixed"></span>');
    }
    var innerjQ = jQ.children()
    .css('filter', 'progid:DXImageTransform.Microsoft'
        + '.Matrix(M11=' + x + ",SizingMethod='auto expand')"
    );
    function calculateMarginRight() {
      jQ.css('marginRight', (innerjQ.width()-1)*(x-1)/x + 'px');
    }
    calculateMarginRight();
    var intervalId = setInterval(calculateMarginRight);
    $(window).load(function() {
      clearTimeout(intervalId);
      calculateMarginRight();
    });
  };
}
else {
  scale = function(jQ, x, y) {
    jQ.css('fontSize', y + 'em');
  };
}

var Style = P(MathCommand, function(_, _super) {
  _.init = function(ctrlSeq, tagName, attrs) {
    _super.init.call(this, ctrlSeq, '<'+tagName+' '+attrs+'>&0</'+tagName+'>');
  };
});

//fonts
LatexCmds.mathrm = bind(Style, '\\mathrm', 'span', 'class="roman font"');
LatexCmds.mathit = bind(Style, '\\mathit', 'i', 'class="font"');
LatexCmds.mathbf = bind(Style, '\\mathbf', 'b', 'class="font"');
LatexCmds.mathsf = bind(Style, '\\mathsf', 'span', 'class="sans-serif font"');
LatexCmds.mathtt = bind(Style, '\\mathtt', 'span', 'class="monospace font"');
//text-decoration
LatexCmds.underline = bind(Style, '\\underline', 'span', 'class="non-leaf underline"');
LatexCmds.overline = LatexCmds.bar = bind(Style, '\\overline', 'span', 'class="non-leaf overline"');
LatexCmds.overleftrightarrow = LatexCmds.bar = bind(Style, '\\overleftrightarrow', 'span', 'class="non-leaf overleftrightarrow"');
LatexCmds.overrightarrow = LatexCmds.bar = bind(Style, '\\overrightarrow', 'span', 'class="non-leaf overrightarrow"');

var SupSub = P(MathCommand, function(_, _super) {
  _.init = function(ctrlSeq, tag, text) {
    _super.init.call(this, ctrlSeq, '<'+tag+' class="non-leaf">&0</'+tag+'>', [ text ]);
  };
  _.finalizeTree = function() {
    //TODO: use inheritance
    pray('SupSub is only _ and ^',
      this.ctrlSeq === '^' || this.ctrlSeq === '_'
    );

    if (this.ctrlSeq === '_') {
      this.down = this.firstChild;
      this.firstChild.up = insertBeforeUnlessAtEnd;
    }
    else {
      this.up = this.firstChild;
      this.firstChild.down = insertBeforeUnlessAtEnd;
    }
    function insertBeforeUnlessAtEnd(cursor) {
      // cursor.insertBefore(cmd), unless cursor at the end of block, and every
      // ancestor cmd is at the end of every ancestor block
      var cmd = this.parent, ancestorCmd = cursor;
      do {
        if (ancestorCmd.next) {
          cursor.insertBefore(cmd);
          return false;
        }
        ancestorCmd = ancestorCmd.parent.parent;
      } while (ancestorCmd !== cmd);
      cursor.insertAfter(cmd);
      return false;
    }
  };
  _.latex = function() {
    var latex = this.firstChild.latex();
    if (latex.length === 1)
      return this.ctrlSeq + latex;
    else
      return this.ctrlSeq + '{' + (latex || ' ') + '}';
  };
  _.redraw = function() {
    if (this.prev)
      this.prev.respace();
    //SupSub::respace recursively calls respace on all the following SupSubs
    //so if prev is a SupSub, no need to call respace on this or following nodes
    if (!(this.prev instanceof SupSub)) {
      this.respace();
      //and if next is a SupSub, then this.respace() will have already called
      //this.next.respace()
      if (this.next && !(this.next instanceof SupSub))
        this.next.respace();
    }
  };
  _.respace = function() {
    if (
      this.prev.ctrlSeq === '\\int ' || (
        this.prev instanceof SupSub && this.prev.ctrlSeq != this.ctrlSeq
        && this.prev.prev && this.prev.prev.ctrlSeq === '\\int '
      )
    ) {
      if (!this.limit) {
        this.limit = true;
        this.jQ.addClass('limit');
      }
    }
    else {
      if (this.limit) {
        this.limit = false;
        this.jQ.removeClass('limit');
      }
    }

    this.respaced = this.prev instanceof SupSub && this.prev.ctrlSeq != this.ctrlSeq && !this.prev.respaced;
    if (this.respaced) {
      var fontSize = +this.jQ.css('fontSize').slice(0,-2),
        prevWidth = this.prev.jQ.outerWidth(),
        thisWidth = this.jQ.outerWidth();
      this.jQ.css({
        left: (this.limit && this.ctrlSeq === '_' ? -.25 : 0) - prevWidth/fontSize + 'em',
        marginRight: .1 - min(thisWidth, prevWidth)/fontSize + 'em'
          //1px extra so it doesn't wrap in retarded browsers (Firefox 2, I think)
      });
    }
    else if (this.limit && this.ctrlSeq === '_') {
      this.jQ.css({
        left: '-.25em',
        marginRight: ''
      });
    }
    else {
      this.jQ.css({
        left: '',
        marginRight: ''
      });
    }

    if (this.next instanceof SupSub)
      this.next.respace();

    return this;
  };
});

LatexCmds.subscript =
LatexCmds._ = bind(SupSub, '_', 'sub', '_');

LatexCmds.superscript =
LatexCmds.supscript =
LatexCmds['^'] = bind(SupSub, '^', 'sup', '**');

var Fraction =
LatexCmds.frac =
LatexCmds.dfrac =
LatexCmds.cfrac =
LatexCmds.fraction = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\frac';
  _.htmlTemplate =
      '<span class="fraction non-leaf">'
    +   '<span class="numerator">&0</span>'
    +   '<span class="denominator">&1</span>'
    +   '<span style="display:inline-block;width:0">&nbsp;</span>'
    + '</span>'
  ;
  _.textTemplate = ['(', '/', ')'];
  _.finalizeTree = function() {
    this.up = this.lastChild.up = this.firstChild;
    this.down = this.firstChild.down = this.lastChild;
  };
});

var LiveFraction =
LatexCmds.over =
CharCmds['/'] = P(Fraction, function(_, _super) {
  _.createBefore = function(cursor) {
    if (!this.replacedFragment) {
      var prev = cursor.prev;
      while (prev &&
        !(
          prev instanceof BinaryOperator ||
          prev instanceof TextBlock ||
          prev instanceof BigSymbol
        ) //lookbehind for operator
      )
        prev = prev.prev;

      if (prev instanceof BigSymbol && prev.next instanceof SupSub) {
        prev = prev.next;
        if (prev.next instanceof SupSub && prev.next.ctrlSeq != prev.ctrlSeq)
          prev = prev.next;
      }

      if (prev !== cursor.prev) {
        this.replaces(MathFragment(prev.next || cursor.parent.firstChild, cursor.prev));
        cursor.prev = prev;
      }
    }
    _super.createBefore.call(this, cursor);
  };
});

var SquareRoot =
LatexCmds.sqrt =
LatexCmds['√'] = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\sqrt';
  _.htmlTemplate =
      '<span class="non-leaf">'
    +   '<span class="scaled sqrt-prefix">&radic;</span>'
    +   '<span class="non-leaf sqrt-stem">&0</span>'
    + '</span>'
  ;
  _.textTemplate = ['sqrt(', ')'];
  _.parser = function() {
    return latexMathParser.optBlock.then(function(optBlock) {
      return latexMathParser.block.map(function(block) {
        var nthroot = NthRoot();
        nthroot.blocks = [ optBlock, block ];
        optBlock.adopt(nthroot, 0, 0);
        block.adopt(nthroot, optBlock, 0);
        return nthroot;
      });
    }).or(_super.parser.call(this));
  };
  _.redraw = function() {
    var block = this.lastChild.jQ;
    scale(block.prev(), 1, block.innerHeight()/+block.css('fontSize').slice(0,-2) - .1);
  };
});


var NthRoot =
LatexCmds.nthroot = P(SquareRoot, function(_, _super) {
  _.htmlTemplate =
      '<sup class="nthroot non-leaf">&0</sup>'
    + '<span class="scaled">'
    +   '<span class="sqrt-prefix scaled">&radic;</span>'
    +   '<span class="sqrt-stem non-leaf">&1</span>'
    + '</span>'
  ;
  _.textTemplate = ['sqrt[', '](', ')'];
  _.latex = function() {
    return '\\sqrt['+this.firstChild.latex()+']{'+this.lastChild.latex()+'}';
  };
});

// Round/Square/Curly/Angle Brackets (aka Parens/Brackets/Braces)
var Bracket = P(MathCommand, function(_, _super) {
  _.init = function(open, close, ctrlSeq, end) {
    _super.init.call(this, '\\left'+ctrlSeq,
        '<span class="non-leaf">'
      +   '<span class="scaled paren">'+open+'</span>'
      +   '<span class="non-leaf">&0</span>'
      +   '<span class="scaled paren">'+close+'</span>'
      + '</span>',
      [open, close]);
    this.end = '\\right'+end;
  };
  _.jQadd = function() {
    _super.jQadd.apply(this, arguments);
    var jQ = this.jQ;
    this.bracketjQs = jQ.children(':first').add(jQ.children(':last'));
  };
  _.latex = function() {
    return this.ctrlSeq + this.firstChild.latex() + this.end;
  };
  _.redraw = function() {
    var blockjQ = this.firstChild.jQ;

    var height = blockjQ.outerHeight()/+blockjQ.css('fontSize').slice(0,-2);

    scale(this.bracketjQs, min(1 + .2*(height - 1), 1.2), 1.05*height);
  };
});

LatexCmds.left = P(MathCommand, function(_) {
  _.parser = function() {
    var regex = Parser.regex;
    var string = Parser.string;
    var regex = Parser.regex;
    var succeed = Parser.succeed;
    var block = latexMathParser.block;
    var optWhitespace = Parser.optWhitespace;

    return optWhitespace.then(regex(/^(?:[([|]|\\\{)/))
      .then(function(open) {
        if (open.charAt(0) === '\\') open = open.slice(1);

        var cmd = CharCmds[open]();

        return latexMathParser
          .map(function (block) {
            cmd.blocks = [ block ];
            block.adopt(cmd, 0, 0);
          })
          .then(string('\\right'))
          .skip(optWhitespace)
          .then(regex(/^(?:[\])|]|\\\})/))
          .then(function(close) {
            if (close.slice(-1) !== cmd.end.slice(-1)) {
              return Parser.fail('open doesn\'t match close');
            }

            return succeed(cmd);
          })
        ;
      })
    ;
  };
});

LatexCmds.right = P(MathCommand, function(_) {
  _.parser = function() {
    return Parser.fail('unmatched \\right');
  };
});

LatexCmds.lbrace =
CharCmds['{'] = bind(Bracket, '{', '}', '\\{', '\\}');
LatexCmds.langle =
LatexCmds.lang = bind(Bracket, '&lang;','&rang;','\\langle ','\\rangle ');

// Closing bracket matching opening bracket above
var CloseBracket = P(Bracket, function(_, _super) {
  _.createBefore = function(cursor) {
    // if I'm at the end of my parent who is a matching open-paren,
    // and I am not replacing a selection fragment, don't create me,
    // just put cursor after my parent
    if (!cursor.next && cursor.parent.parent && cursor.parent.parent.end === this.end && !this.replacedFragment)
      cursor.insertAfter(cursor.parent.parent);
    else
      _super.createBefore.call(this, cursor);
  };
  _.placeCursor = function(cursor) {
    this.firstChild.blur();
    cursor.insertAfter(this);
  };
});

LatexCmds.rbrace =
CharCmds['}'] = bind(CloseBracket, '{','}','\\{','\\}');
LatexCmds.rangle =
LatexCmds.rang = bind(CloseBracket, '&lang;','&rang;','\\langle ','\\rangle ');

var parenMixin = function(_, _super) {
  _.init = function(open, close) {
    _super.init.call(this, open, close, open, close);
  };
};

var Paren = P(Bracket, parenMixin);

LatexCmds.lparen =
CharCmds['('] = bind(Paren, '(', ')');
LatexCmds.lbrack =
LatexCmds.lbracket =
CharCmds['['] = bind(Paren, '[', ']');

var CloseParen = P(CloseBracket, parenMixin);

LatexCmds.rparen =
CharCmds[')'] = bind(CloseParen, '(', ')');
LatexCmds.rbrack =
LatexCmds.rbracket =
CharCmds[']'] = bind(CloseParen, '[', ']');

var Pipes =
LatexCmds.lpipe =
LatexCmds.rpipe =
CharCmds['|'] = P(Paren, function(_, _super) {
  _.init = function() {
    _super.init.call(this, '|', '|');
  }

  _.createBefore = CloseBracket.prototype.createBefore;
});

var TextBlock =
CharCmds.$ =
LatexCmds.text =
LatexCmds.textnormal =
LatexCmds.textrm =
LatexCmds.textup =
LatexCmds.textmd = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\text';
  _.htmlTemplate = '<span class="text">&0</span>';
  _.replaces = function(replacedText) {
    if (replacedText instanceof MathFragment)
      this.replacedText = replacedText.remove().jQ.text();
    else if (typeof replacedText === 'string')
      this.replacedText = replacedText;
  };
  _.textTemplate = ['"', '"'];
  _.parser = function() {
    // TODO: correctly parse text mode
    var string = Parser.string;
    var regex = Parser.regex;
    var optWhitespace = Parser.optWhitespace;
    return optWhitespace
      .then(string('{')).then(regex(/^[^}]*/)).skip(string('}'))
      .map(function(text) {
        var cmd = TextBlock();
        cmd.createBlocks();
        var block = cmd.firstChild;
        for (var i = 0; i < text.length; i += 1) {
          var ch = VanillaSymbol(text.charAt(i));
          ch.adopt(block, block.lastChild, 0);
        }
        return cmd;
      })
    ;
  };
  _.createBlocks = function() {
    //FIXME: another possible Law of Demeter violation, but this seems much cleaner, like it was supposed to be done this way
    this.firstChild =
    this.lastChild =
      InnerTextBlock();

    this.blocks = [ this.firstChild ];

    this.firstChild.parent = this;
  };
  _.finalizeInsert = function() {
    //FIXME HACK blur removes the TextBlock
    this.firstChild.blur = function() { delete this.blur; return this; };
    _super.finalizeInsert.call(this);
  };
  _.createBefore = function(cursor) {
    _super.createBefore.call(this, this.cursor = cursor);

    if (this.replacedText)
      for (var i = 0; i < this.replacedText.length; i += 1)
        this.write(this.replacedText.charAt(i));
  };
  _.write = function(ch) {
    this.cursor.insertNew(VanillaSymbol(ch));
  };
  _.onKey = function(key, e) {
    //backspace and delete and ends of block don't unwrap
    if (!this.cursor.selection &&
      (
        (key === 'Backspace' && !this.cursor.prev) ||
        (key === 'Del' && !this.cursor.next)
      )
    ) {
      if (this.isEmpty())
        this.cursor.insertAfter(this);

      return false;
    }
  };
  _.onText = function(ch) {
    this.cursor.prepareEdit();
    if (ch !== '$')
      this.write(ch);
    else if (this.isEmpty())
      this.cursor.insertAfter(this).backspace().insertNew(VanillaSymbol('\\$','$'));
    else if (!this.cursor.next)
      this.cursor.insertAfter(this);
    else if (!this.cursor.prev)
      this.cursor.insertBefore(this);
    else { //split apart
      var next = TextBlock(MathFragment(this.cursor.next, this.firstChild.lastChild));
      next.placeCursor = function(cursor) { //FIXME HACK: pretend no prev so they don't get merged
        this.prev = 0;
        delete this.placeCursor;
        this.placeCursor(cursor);
      };
      next.firstChild.focus = function(){ return this; };
      this.cursor.insertAfter(this).insertNew(next);
      next.prev = this;
      this.cursor.insertBefore(next);
      delete next.firstChild.focus;
    }
    return false;
  };
});

var InnerTextBlock = P(MathBlock, function(_, _super) {
  _.blur = function() {
    this.jQ.removeClass('hasCursor');
    if (this.isEmpty()) {
      var textblock = this.parent, cursor = textblock.cursor;
      if (cursor.parent === this)
        this.jQ.addClass('empty');
      else {
        cursor.hide();
        textblock.remove();
        if (cursor.next === textblock)
          cursor.next = textblock.next;
        else if (cursor.prev === textblock)
          cursor.prev = textblock.prev;

        cursor.show().parent.bubble('redraw');
      }
    }
    return this;
  };
  _.focus = function() {
    _super.focus.call(this);

    var textblock = this.parent;
    if (textblock.next.ctrlSeq === textblock.ctrlSeq) { //TODO: seems like there should be a better way to move MathElements around
      var innerblock = this,
        cursor = textblock.cursor,
        next = textblock.next.firstChild;

      next.eachChild(function(child){
        child.parent = innerblock;
        child.jQ.appendTo(innerblock.jQ);
      });

      if (this.lastChild)
        this.lastChild.next = next.firstChild;
      else
        this.firstChild = next.firstChild;

      next.firstChild.prev = this.lastChild;
      this.lastChild = next.lastChild;

      next.parent.remove();

      if (cursor.prev)
        cursor.insertAfter(cursor.prev);
      else
        cursor.prependTo(this);

      cursor.parent.bubble('redraw');
    }
    else if (textblock.prev.ctrlSeq === textblock.ctrlSeq) {
      var cursor = textblock.cursor;
      if (cursor.prev)
        textblock.prev.firstChild.focus();
      else
        cursor.appendTo(textblock.prev.firstChild);
    }
    return this;
  };
});


function makeTextBlock(latex, tagName, attrs) {
  return P(TextBlock, {
    ctrlSeq: latex,
    htmlTemplate: '<'+tagName+' '+attrs+'>&0</'+tagName+'>'
  });
}

LatexCmds.em = LatexCmds.italic = LatexCmds.italics =
LatexCmds.emph = LatexCmds.textit = LatexCmds.textsl =
  makeTextBlock('\\textit', 'i', 'class="text"');
LatexCmds.strong = LatexCmds.bold = LatexCmds.textbf =
  makeTextBlock('\\textbf', 'b', 'class="text"');
LatexCmds.sf = LatexCmds.textsf =
  makeTextBlock('\\textsf', 'span', 'class="sans-serif text"');
LatexCmds.tt = LatexCmds.texttt =
  makeTextBlock('\\texttt', 'span', 'class="monospace text"');
LatexCmds.textsc =
  makeTextBlock('\\textsc', 'span', 'style="font-variant:small-caps" class="text"');
LatexCmds.uppercase =
  makeTextBlock('\\uppercase', 'span', 'style="text-transform:uppercase" class="text"');
LatexCmds.lowercase =
  makeTextBlock('\\lowercase', 'span', 'style="text-transform:lowercase" class="text"');

// input box to type a variety of LaTeX commands beginning with a backslash
var LatexCommandInput =
CharCmds['\\'] = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\';
  _.replaces = function(replacedFragment) {
    this._replacedFragment = replacedFragment.disown();
    this.isEmpty = function() { return false; };
  };
  _.htmlTemplate = '<span class="latex-command-input non-leaf">\\<span>&0</span></span>';
  _.textTemplate = ['\\'];
  _.createBlocks = function() {
    _super.createBlocks.call(this);
    this.firstChild.focus = function() {
      this.parent.jQ.addClass('hasCursor');
      if (this.isEmpty())
        this.parent.jQ.removeClass('empty');

      return this;
    };
    this.firstChild.blur = function() {
      this.parent.jQ.removeClass('hasCursor');
      if (this.isEmpty())
        this.parent.jQ.addClass('empty');

      return this;
    };
  };
  _.createBefore = function(cursor) {
    _super.createBefore.call(this, cursor);
    this.cursor = cursor.appendTo(this.firstChild);
    if (this._replacedFragment) {
      var el = this.jQ[0];
      this.jQ =
        this._replacedFragment.jQ.addClass('blur').bind(
          'mousedown mousemove', //FIXME: is monkey-patching the mousedown and mousemove handlers the right way to do this?
          function(e) {
            $(e.target = el).trigger(e);
            return false;
          }
        ).insertBefore(this.jQ).add(this.jQ);
    }
  };
  _.latex = function() {
    return '\\' + this.firstChild.latex() + ' ';
  };
  _.onKey = function(key, e) {
    if (key === 'Tab' || key === 'Enter' || key === 'Spacebar') {
      this.renderCommand();
      e.preventDefault();
      return false;
    }
  };
  _.onText = function(ch) {
    if (ch.match(/[a-z]/i)) {
      this.cursor.prepareEdit();
      this.cursor.insertNew(VanillaSymbol(ch));
      return false;
    }
    this.renderCommand();
    if (ch === '\\' && this.firstChild.isEmpty())
      return false;
  };
  _.renderCommand = function() {
    this.jQ = this.jQ.last();
    this.remove();
    if (this.next) {
      this.cursor.insertBefore(this.next);
    } else {
      this.cursor.appendTo(this.parent);
    }

    var latex = this.firstChild.latex(), cmd;
    if (!latex) latex = 'backslash';
    this.cursor.insertCmd(latex, this._replacedFragment);
  };
});

var Binomial =
LatexCmds.binom =
LatexCmds.binomial = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\binom';
  _.htmlTemplate =
      '<span class="paren scaled">(</span>'
    + '<span class="non-leaf">'
    +   '<span class="array non-leaf">'
    +     '<span>&0</span>'
    +     '<span>&1</span>'
    +   '</span>'
    + '</span>'
    + '<span class="paren scaled">)</span>'
  ;
  _.textTemplate = ['choose(',',',')'];
  _.redraw = function() {
    var blockjQ = this.jQ.eq(1);

    var height = blockjQ.outerHeight()/+blockjQ.css('fontSize').slice(0,-2);

    var parens = this.jQ.filter('.paren');
    scale(parens, min(1 + .2*(height - 1), 1.2), 1.05*height);
  };
});

var Choose =
LatexCmds.choose = P(Binomial, function(_) {
  _.createBefore = LiveFraction.prototype.createBefore;
});

var Vector =
LatexCmds.vector = P(MathCommand, function(_, _super) {
  _.ctrlSeq = '\\vector';
  _.htmlTemplate = '<span class="array"><span>&0</span></span>';
  _.latex = function() {
    return '\\begin{matrix}' + this.foldChildren([], function(latex, child) {
      latex.push(child.latex());
      return latex;
    }).join('\\\\') + '\\end{matrix}';
  };
  _.text = function() {
    return '[' + this.foldChildren([], function(text, child) {
      text.push(child.text());
      return text;
    }).join() + ']';
  }
  _.createBefore = function(cursor) {
    _super.createBefore.call(this, this.cursor = cursor);
  };
  _.onKey = function(key, e) {
    var currentBlock = this.cursor.parent;

    if (currentBlock.parent === this) {
      if (key === 'Enter') { //enter
        var newBlock = MathBlock();
        newBlock.parent = this;
        newBlock.jQ = $('<span></span>')
          .attr(mqBlockId, newBlock.id)
          .insertAfter(currentBlock.jQ);
        if (currentBlock.next)
          currentBlock.next.prev = newBlock;
        else
          this.lastChild = newBlock;

        newBlock.next = currentBlock.next;
        currentBlock.next = newBlock;
        newBlock.prev = currentBlock;
        this.bubble('redraw').cursor.appendTo(newBlock);

        e.preventDefault();
        return false;
      }
      else if (key === 'Tab' && !currentBlock.next) {
        if (currentBlock.isEmpty()) {
          if (currentBlock.prev) {
            this.cursor.insertAfter(this);
            delete currentBlock.prev.next;
            this.lastChild = currentBlock.prev;
            currentBlock.jQ.remove();
            this.bubble('redraw');

            e.preventDefault();
            return false;
          }
          else
            return;
        }

        var newBlock = MathBlock();
        newBlock.parent = this;
        newBlock.jQ = $('<span></span>').attr(mqBlockId, newBlock.id).appendTo(this.jQ);
        this.lastChild = newBlock;
        currentBlock.next = newBlock;
        newBlock.prev = currentBlock;
        this.bubble('redraw').cursor.appendTo(newBlock);

        e.preventDefault();
        return false;
      }
      else if (e.which === 8) { //backspace
        if (currentBlock.isEmpty()) {
          if (currentBlock.prev) {
            this.cursor.appendTo(currentBlock.prev)
            currentBlock.prev.next = currentBlock.next;
          }
          else {
            this.cursor.insertBefore(this);
            this.firstChild = currentBlock.next;
          }

          if (currentBlock.next)
            currentBlock.next.prev = currentBlock.prev;
          else
            this.lastChild = currentBlock.prev;

          currentBlock.jQ.remove();
          if (this.isEmpty())
            this.cursor.deleteForward();
          else
            this.bubble('redraw');

          e.preventDefault();
          return false;
        }
        else if (!this.cursor.prev) {
          e.preventDefault();
          return false;
        }
      }
    }
  };
});

LatexCmds.editable = P(RootMathCommand, function(_, _super) {
  _.init = function() {
    MathCommand.prototype.init.call(this, '\\editable');
  };

  _.jQadd = function() {
    var self = this;
    // FIXME: this entire method is a giant hack to get around
    // having to call createBlocks, and createRoot expecting to
    // render the contents' LaTeX. Both need to be refactored.
    _super.jQadd.apply(self, arguments);
    var block = self.firstChild.disown();
    var blockjQ = self.jQ.children().detach();

    self.firstChild =
    self.lastChild =
      RootMathBlock();

    self.blocks = [ self.firstChild ];

    self.firstChild.parent = self;

    createRoot(self.jQ, self.firstChild, false, true);
    self.cursor = self.firstChild.cursor;

    block.children().adopt(self.firstChild, 0, 0);
    blockjQ.appendTo(self.firstChild.jQ);

    self.firstChild.cursor.appendTo(self.firstChild);
  };

  _.latex = function(){ return this.firstChild.latex(); };
  _.text = function(){ return this.firstChild.text(); };
});
/**********************************
 * Symbols and Special Characters
 *********************************/

LatexCmds.f = bind(Symbol, 'f', '<var class="florin">&fnof;</var><span style="display:inline-block;width:0">&nbsp;</span>');

var Variable = P(Symbol, function(_, _super) {
  _.init = function(ch, html) {
    _super.init.call(this, ch, '<var>'+(html || ch)+'</var>');
  }
  _.text = function() {
    var text = this.ctrlSeq;
    if (this.prev && !(this.prev instanceof Variable)
        && !(this.prev instanceof BinaryOperator))
      text = '*' + text;
    if (this.next && !(this.next instanceof BinaryOperator)
        && !(this.next.ctrlSeq === '^'))
      text += '*';
    return text;
  };
});

var VanillaSymbol = P(Symbol, function(_, _super) {
  _.init = function(ch, html) {
    _super.init.call(this, ch, '<span>'+(html || ch)+'</span>');
  };
});

CharCmds[' '] = bind(VanillaSymbol, '\\:', ' ');

LatexCmds.prime = CharCmds["'"] = bind(VanillaSymbol, "'", '&prime;');

// does not use Symbola font
var NonSymbolaSymbol = P(Symbol, function(_, _super) {
  _.init = function(ch, html) {
    _super.init.call(this, ch, '<span class="nonSymbola">'+(html || ch)+'</span>');
  };
});

LatexCmds['@'] = NonSymbolaSymbol;
LatexCmds['&'] = bind(NonSymbolaSymbol, '\\&', '&amp;');
LatexCmds['%'] = bind(NonSymbolaSymbol, '\\%', '%');

//the following are all Greek to me, but this helped a lot: http://www.ams.org/STIX/ion/stixsig03.html

//lowercase Greek letter variables
LatexCmds.alpha =
LatexCmds.beta =
LatexCmds.gamma =
LatexCmds.delta =
LatexCmds.zeta =
LatexCmds.eta =
LatexCmds.theta =
LatexCmds.iota =
LatexCmds.kappa =
LatexCmds.mu =
LatexCmds.nu =
LatexCmds.xi =
LatexCmds.rho =
LatexCmds.sigma =
LatexCmds.tau =
LatexCmds.chi =
LatexCmds.psi =
LatexCmds.omega = P(Variable, function(_, _super) {
  _.init = function(latex) {
    _super.init.call(this,'\\'+latex+' ','&'+latex+';');
  };
});

//why can't anybody FUCKING agree on these
LatexCmds.phi = //W3C or Unicode?
  bind(Variable,'\\phi ','&#981;');

LatexCmds.phiv = //Elsevier and 9573-13
LatexCmds.varphi = //AMS and LaTeX
  bind(Variable,'\\varphi ','&phi;');

LatexCmds.epsilon = //W3C or Unicode?
  bind(Variable,'\\epsilon ','&#1013;');

LatexCmds.epsiv = //Elsevier and 9573-13
LatexCmds.varepsilon = //AMS and LaTeX
  bind(Variable,'\\varepsilon ','&epsilon;');

LatexCmds.piv = //W3C/Unicode and Elsevier and 9573-13
LatexCmds.varpi = //AMS and LaTeX
  bind(Variable,'\\varpi ','&piv;');

LatexCmds.sigmaf = //W3C/Unicode
LatexCmds.sigmav = //Elsevier
LatexCmds.varsigma = //LaTeX
  bind(Variable,'\\varsigma ','&sigmaf;');

LatexCmds.thetav = //Elsevier and 9573-13
LatexCmds.vartheta = //AMS and LaTeX
LatexCmds.thetasym = //W3C/Unicode
  bind(Variable,'\\vartheta ','&thetasym;');

LatexCmds.upsilon = //AMS and LaTeX and W3C/Unicode
LatexCmds.upsi = //Elsevier and 9573-13
  bind(Variable,'\\upsilon ','&upsilon;');

//these aren't even mentioned in the HTML character entity references
LatexCmds.gammad = //Elsevier
LatexCmds.Gammad = //9573-13 -- WTF, right? I dunno if this was a typo in the reference (see above)
LatexCmds.digamma = //LaTeX
  bind(Variable,'\\digamma ','&#989;');

LatexCmds.kappav = //Elsevier
LatexCmds.varkappa = //AMS and LaTeX
  bind(Variable,'\\varkappa ','&#1008;');

LatexCmds.rhov = //Elsevier and 9573-13
LatexCmds.varrho = //AMS and LaTeX
  bind(Variable,'\\varrho ','&#1009;');

//Greek constants, look best in un-italicised Times New Roman
LatexCmds.pi = LatexCmds['π'] = bind(NonSymbolaSymbol,'\\pi ','&pi;');
LatexCmds.lambda = bind(NonSymbolaSymbol,'\\lambda ','&lambda;');

//uppercase greek letters

LatexCmds.Upsilon = //LaTeX
LatexCmds.Upsi = //Elsevier and 9573-13
LatexCmds.upsih = //W3C/Unicode "upsilon with hook"
LatexCmds.Upsih = //'cos it makes sense to me
  bind(Symbol,'\\Upsilon ','<var style="font-family: serif">&upsih;</var>'); //Symbola's 'upsilon with a hook' is a capital Y without hooks :(

//other symbols with the same LaTeX command and HTML character entity reference
LatexCmds.Gamma =
LatexCmds.Delta =
LatexCmds.Theta =
LatexCmds.Lambda =
LatexCmds.Xi =
LatexCmds.Pi =
LatexCmds.Sigma =
LatexCmds.Phi =
LatexCmds.Psi =
LatexCmds.Omega =
LatexCmds.forall = P(VanillaSymbol, function(_, _super) {
  _.init = function(latex) {
    _super.init.call(this,'\\'+latex+' ','&'+latex+';');
  };
});

// symbols that aren't a single MathCommand, but are instead a whole
// Fragment. Creates the Fragment from a LaTeX string
var LatexFragment = P(MathCommand, function(_) {
  _.init = function(latex) { this.latex = latex; };
  _.createBefore = function(cursor) { cursor.writeLatex(this.latex); };
  _.parser = function() {
    var frag = latexMathParser.parse(this.latex).children();
    return Parser.succeed(frag);
  };
});

// for what seems to me like [stupid reasons][1], Unicode provides
// subscripted and superscripted versions of all ten Arabic numerals,
// as well as [so-called "vulgar fractions"][2].
// Nobody really cares about most of them, but some of them actually
// predate Unicode, dating back to [ISO-8859-1][3], apparently also
// known as "Latin-1", which among other things [Windows-1252][4]
// largely coincides with, so Microsoft Word sometimes inserts them
// and they get copy-pasted into MathQuill.
//
// (Irrelevant but funny story: Windows-1252 is actually a strict
// superset of the "closely related but distinct"[3] "ISO 8859-1" --
// see the lack of a dash after "ISO"? Completely different character
// set, like elephants vs elephant seals, or "Zombies" vs "Zombie
// Redneck Torture Family". What kind of idiot would get them confused.
// People in fact got them confused so much, it was so common to
// mislabel Windows-1252 text as ISO-8859-1, that most modern web
// browsers and email clients treat the MIME charset of ISO-8859-1
// as actually Windows-1252, behavior now standard in the HTML5 spec.)
//
// [1]: http://en.wikipedia.org/wiki/Unicode_subscripts_and_superscripts
// [2]: http://en.wikipedia.org/wiki/Number_Forms
// [3]: http://en.wikipedia.org/wiki/ISO/IEC_8859-1
// [4]: http://en.wikipedia.org/wiki/Windows-1252
LatexCmds['¹'] = bind(LatexFragment, '^1');
LatexCmds['²'] = bind(LatexFragment, '^2');
LatexCmds['³'] = bind(LatexFragment, '^3');
LatexCmds['¼'] = bind(LatexFragment, '\\frac14');
LatexCmds['½'] = bind(LatexFragment, '\\frac12');
LatexCmds['¾'] = bind(LatexFragment, '\\frac34');

var BinaryOperator = P(Symbol, function(_, _super) {
  _.init = function(ctrlSeq, html, text) {
    _super.init.call(this,
      ctrlSeq, '<span class="binary-operator">'+html+'</span>', text
    );
  };
});

var PlusMinus = P(BinaryOperator, function(_) {
  _.init = VanillaSymbol.prototype.init;

  _.respace = function() {
    if (!this.prev) {
      this.jQ[0].className = '';
    }
    else if (
      this.prev instanceof BinaryOperator &&
      this.next && !(this.next instanceof BinaryOperator)
    ) {
      this.jQ[0].className = 'unary-operator';
    }
    else {
      this.jQ[0].className = 'binary-operator';
    }
    return this;
  };
});

LatexCmds['+'] = bind(PlusMinus, '+', '+');
//yes, these are different dashes, I think one is an en dash and the other is a hyphen
LatexCmds['–'] = LatexCmds['-'] = bind(PlusMinus, '-', '&minus;');
LatexCmds['±'] = LatexCmds.pm = LatexCmds.plusmn = LatexCmds.plusminus =
  bind(PlusMinus,'\\pm ','&plusmn;');
LatexCmds.mp = LatexCmds.mnplus = LatexCmds.minusplus =
  bind(PlusMinus,'\\mp ','&#8723;');

CharCmds['*'] = LatexCmds.sdot = LatexCmds.cdot =
  bind(BinaryOperator, '\\cdot ', '&middot;');
//semantically should be &sdot;, but &middot; looks better

LatexCmds['='] = bind(BinaryOperator, '=', '=');
LatexCmds['<'] = bind(BinaryOperator, '<', '&lt;');
LatexCmds['>'] = bind(BinaryOperator, '>', '&gt;');

LatexCmds.notin =
LatexCmds.sim =
LatexCmds.cong =
LatexCmds.equiv =
LatexCmds.oplus =
LatexCmds.otimes = P(BinaryOperator, function(_, _super) {
  _.init = function(latex) {
    _super.init.call(this, '\\'+latex+' ', '&'+latex+';');
  };
});

LatexCmds.times = bind(BinaryOperator, '\\times ', '&times;', '[x]');

LatexCmds['÷'] = LatexCmds.div = LatexCmds.divide = LatexCmds.divides =
  bind(BinaryOperator,'\\div ','&divide;', '[/]');

LatexCmds['≠'] = LatexCmds.ne = LatexCmds.neq = bind(BinaryOperator,'\\ne ','&ne;');

LatexCmds.ast = LatexCmds.star = LatexCmds.loast = LatexCmds.lowast =
  bind(BinaryOperator,'\\ast ','&lowast;');
  //case 'there4 = // a special exception for this one, perhaps?
LatexCmds.therefor = LatexCmds.therefore =
  bind(BinaryOperator,'\\therefore ','&there4;');

LatexCmds.cuz = // l33t
LatexCmds.because = bind(BinaryOperator,'\\because ','&#8757;');

LatexCmds.prop = LatexCmds.propto = bind(BinaryOperator,'\\propto ','&prop;');

LatexCmds['≈'] = LatexCmds.asymp = LatexCmds.approx = bind(BinaryOperator,'\\approx ','&asymp;');
LatexCmds.napprox = bind(BinaryOperator,'\\not\\approx ','&#8777;');

LatexCmds.lt = bind(BinaryOperator,'<','&lt;');

LatexCmds.gt = bind(BinaryOperator,'>','&gt;');

LatexCmds['≤'] = LatexCmds.le = LatexCmds.leq = bind(BinaryOperator,'\\le ','&le;');

LatexCmds['≥'] = LatexCmds.ge = LatexCmds.geq = bind(BinaryOperator,'\\ge ','&ge;');

LatexCmds.isin = LatexCmds['in'] = bind(BinaryOperator,'\\in ','&isin;');

LatexCmds.ni = LatexCmds.contains = bind(BinaryOperator,'\\ni ','&ni;');

LatexCmds.notni = LatexCmds.niton = LatexCmds.notcontains = LatexCmds.doesnotcontain =
  bind(BinaryOperator,'\\not\\ni ','&#8716;');

LatexCmds.sub = LatexCmds.subset = bind(BinaryOperator,'\\subset ','&sub;');

LatexCmds.sup = LatexCmds.supset = LatexCmds.superset =
  bind(BinaryOperator,'\\supset ','&sup;');

LatexCmds.nsub = LatexCmds.notsub =
LatexCmds.nsubset = LatexCmds.notsubset =
  bind(BinaryOperator,'\\not\\subset ','&#8836;');

LatexCmds.nsup = LatexCmds.notsup =
LatexCmds.nsupset = LatexCmds.notsupset =
LatexCmds.nsuperset = LatexCmds.notsuperset =
  bind(BinaryOperator,'\\not\\supset ','&#8837;');

LatexCmds.sube = LatexCmds.subeq = LatexCmds.subsete = LatexCmds.subseteq =
  bind(BinaryOperator,'\\subseteq ','&sube;');

LatexCmds.supe = LatexCmds.supeq =
LatexCmds.supsete = LatexCmds.supseteq =
LatexCmds.supersete = LatexCmds.superseteq =
  bind(BinaryOperator,'\\supseteq ','&supe;');

LatexCmds.nsube = LatexCmds.nsubeq =
LatexCmds.notsube = LatexCmds.notsubeq =
LatexCmds.nsubsete = LatexCmds.nsubseteq =
LatexCmds.notsubsete = LatexCmds.notsubseteq =
  bind(BinaryOperator,'\\not\\subseteq ','&#8840;');

LatexCmds.nsupe = LatexCmds.nsupeq =
LatexCmds.notsupe = LatexCmds.notsupeq =
LatexCmds.nsupsete = LatexCmds.nsupseteq =
LatexCmds.notsupsete = LatexCmds.notsupseteq =
LatexCmds.nsupersete = LatexCmds.nsuperseteq =
LatexCmds.notsupersete = LatexCmds.notsuperseteq =
  bind(BinaryOperator,'\\not\\supseteq ','&#8841;');


//sum, product, coproduct, integral
var BigSymbol = P(Symbol, function(_, _super) {
  _.init = function(ch, html) {
    _super.init.call(this, ch, '<big>'+html+'</big>');
  };
});

LatexCmds['∑'] = LatexCmds.sum = LatexCmds.summation = bind(BigSymbol,'\\sum ','&sum;');
LatexCmds['∏'] = LatexCmds.prod = LatexCmds.product = bind(BigSymbol,'\\prod ','&prod;');
LatexCmds.coprod = LatexCmds.coproduct = bind(BigSymbol,'\\coprod ','&#8720;');
LatexCmds['∫'] = LatexCmds['int'] = LatexCmds.integral = bind(BigSymbol,'\\int ','&int;');



//the canonical sets of numbers
// LatexCmds.N =
LatexCmds.naturals = LatexCmds.Naturals =
  bind(VanillaSymbol,'\\mathbb{N}','&#8469;');

// LatexCmds.P =
LatexCmds.primes = LatexCmds.Primes =
LatexCmds.projective = LatexCmds.Projective =
LatexCmds.probability = LatexCmds.Probability =
  bind(VanillaSymbol,'\\mathbb{P}','&#8473;');

// LatexCmds.Z =
LatexCmds.integers = LatexCmds.Integers =
  bind(VanillaSymbol,'\\mathbb{Z}','&#8484;');

// LatexCmds.Q =
LatexCmds.rationals = LatexCmds.Rationals =
  bind(VanillaSymbol,'\\mathbb{Q}','&#8474;');

// LatexCmds.R =
LatexCmds.reals = LatexCmds.Reals =
  bind(VanillaSymbol,'\\mathbb{R}','&#8477;');

// LatexCmds.C =
LatexCmds.complex = LatexCmds.Complex =
LatexCmds.complexes = LatexCmds.Complexes =
LatexCmds.complexplane = LatexCmds.Complexplane = LatexCmds.ComplexPlane =
  bind(VanillaSymbol,'\\mathbb{C}','&#8450;');

// LatexCmds.H =
LatexCmds.Hamiltonian = LatexCmds.quaternions = LatexCmds.Quaternions =
  bind(VanillaSymbol,'\\mathbb{H}','&#8461;');

//spacing
LatexCmds.quad = LatexCmds.emsp = bind(VanillaSymbol,'\\quad ','    ');
LatexCmds.qquad = bind(VanillaSymbol,'\\qquad ','        ');
/* spacing special characters, gonna have to implement this in LatexCommandInput::onText somehow
case ',':
  return VanillaSymbol('\\, ',' ');
case ':':
  return VanillaSymbol('\\: ','  ');
case ';':
  return VanillaSymbol('\\; ','   ');
case '!':
  return Symbol('\\! ','<span style="margin-right:-.2em"></span>');
*/

//binary operators
LatexCmds.diamond = bind(VanillaSymbol, '\\diamond ', '&#9671;');
LatexCmds.bigtriangleup = bind(VanillaSymbol, '\\bigtriangleup ', '&#9651;');
LatexCmds.ominus = bind(VanillaSymbol, '\\ominus ', '&#8854;');
LatexCmds.uplus = bind(VanillaSymbol, '\\uplus ', '&#8846;');
LatexCmds.bigtriangledown = bind(VanillaSymbol, '\\bigtriangledown ', '&#9661;');
LatexCmds.sqcap = bind(VanillaSymbol, '\\sqcap ', '&#8851;');
LatexCmds.lhd = bind(VanillaSymbol, '\\lhd ', '&#8882;');
LatexCmds.triangleleft = bind(VanillaSymbol, '\\triangleleft ', '&#8882;');
LatexCmds.sqcup = bind(VanillaSymbol, '\\sqcup ', '&#8852;');
LatexCmds.rhd = bind(VanillaSymbol, '\\rhd ', '&#8883;');
LatexCmds.triangleright = bind(VanillaSymbol, '\\triangleright ', '&#8883;');
LatexCmds.odot = bind(VanillaSymbol, '\\odot ', '&#8857;');
LatexCmds.bigcirc = bind(VanillaSymbol, '\\bigcirc ', '&#9711;');
LatexCmds.dagger = bind(VanillaSymbol, '\\dagger ', '&#0134;');
LatexCmds.ddagger = bind(VanillaSymbol, '\\ddagger ', '&#135;');
LatexCmds.wr = bind(VanillaSymbol, '\\wr ', '&#8768;');
LatexCmds.amalg = bind(VanillaSymbol, '\\amalg ', '&#8720;');

//relationship symbols
LatexCmds.models = bind(VanillaSymbol, '\\models ', '&#8872;');
LatexCmds.prec = bind(VanillaSymbol, '\\prec ', '&#8826;');
LatexCmds.succ = bind(VanillaSymbol, '\\succ ', '&#8827;');
LatexCmds.preceq = bind(VanillaSymbol, '\\preceq ', '&#8828;');
LatexCmds.succeq = bind(VanillaSymbol, '\\succeq ', '&#8829;');
LatexCmds.simeq = bind(VanillaSymbol, '\\simeq ', '&#8771;');
LatexCmds.mid = bind(VanillaSymbol, '\\mid ', '&#8739;');
LatexCmds.ll = bind(VanillaSymbol, '\\ll ', '&#8810;');
LatexCmds.gg = bind(VanillaSymbol, '\\gg ', '&#8811;');
LatexCmds.parallel = bind(VanillaSymbol, '\\parallel ', '&#8741;');
LatexCmds.nparallel = bind(VanillaSymbol, '\\nparallel ', '&#8742;');
LatexCmds.bowtie = bind(VanillaSymbol, '\\bowtie ', '&#8904;');
LatexCmds.sqsubset = bind(VanillaSymbol, '\\sqsubset ', '&#8847;');
LatexCmds.sqsupset = bind(VanillaSymbol, '\\sqsupset ', '&#8848;');
LatexCmds.smile = bind(VanillaSymbol, '\\smile ', '&#8995;');
LatexCmds.sqsubseteq = bind(VanillaSymbol, '\\sqsubseteq ', '&#8849;');
LatexCmds.sqsupseteq = bind(VanillaSymbol, '\\sqsupseteq ', '&#8850;');
LatexCmds.doteq = bind(VanillaSymbol, '\\doteq ', '&#8784;');
LatexCmds.frown = bind(VanillaSymbol, '\\frown ', '&#8994;');
LatexCmds.vdash = bind(VanillaSymbol, '\\vdash ', '&#8870;');
LatexCmds.dashv = bind(VanillaSymbol, '\\dashv ', '&#8867;');

//arrows
LatexCmds.longleftarrow = bind(VanillaSymbol, '\\longleftarrow ', '&#8592;');
LatexCmds.longrightarrow = bind(VanillaSymbol, '\\longrightarrow ', '&#8594;');
LatexCmds.Longleftarrow = bind(VanillaSymbol, '\\Longleftarrow ', '&#8656;');
LatexCmds.Longrightarrow = bind(VanillaSymbol, '\\Longrightarrow ', '&#8658;');
LatexCmds.longleftrightarrow = bind(VanillaSymbol, '\\longleftrightarrow ', '&#8596;');
LatexCmds.updownarrow = bind(VanillaSymbol, '\\updownarrow ', '&#8597;');
LatexCmds.Longleftrightarrow = bind(VanillaSymbol, '\\Longleftrightarrow ', '&#8660;');
LatexCmds.Updownarrow = bind(VanillaSymbol, '\\Updownarrow ', '&#8661;');
LatexCmds.mapsto = bind(VanillaSymbol, '\\mapsto ', '&#8614;');
LatexCmds.nearrow = bind(VanillaSymbol, '\\nearrow ', '&#8599;');
LatexCmds.hookleftarrow = bind(VanillaSymbol, '\\hookleftarrow ', '&#8617;');
LatexCmds.hookrightarrow = bind(VanillaSymbol, '\\hookrightarrow ', '&#8618;');
LatexCmds.searrow = bind(VanillaSymbol, '\\searrow ', '&#8600;');
LatexCmds.leftharpoonup = bind(VanillaSymbol, '\\leftharpoonup ', '&#8636;');
LatexCmds.rightharpoonup = bind(VanillaSymbol, '\\rightharpoonup ', '&#8640;');
LatexCmds.swarrow = bind(VanillaSymbol, '\\swarrow ', '&#8601;');
LatexCmds.leftharpoondown = bind(VanillaSymbol, '\\leftharpoondown ', '&#8637;');
LatexCmds.rightharpoondown = bind(VanillaSymbol, '\\rightharpoondown ', '&#8641;');
LatexCmds.nwarrow = bind(VanillaSymbol, '\\nwarrow ', '&#8598;');
LatexCmds.rightleftarrows = bind(VanillaSymbol, '\\rightleftarrows ', '&#8644;');

//Misc
LatexCmds.ldots = bind(VanillaSymbol, '\\ldots ', '&#8230;');
LatexCmds.cdots = bind(VanillaSymbol, '\\cdots ', '&#8943;');
LatexCmds.vdots = bind(VanillaSymbol, '\\vdots ', '&#8942;');
LatexCmds.ddots = bind(VanillaSymbol, '\\ddots ', '&#8944;');
LatexCmds.surd = bind(VanillaSymbol, '\\surd ', '&#8730;');
LatexCmds.triangle = bind(VanillaSymbol, '\\triangle ', '&#9653;');
LatexCmds.ell = bind(VanillaSymbol, '\\ell ', '&#8467;');
LatexCmds.top = bind(VanillaSymbol, '\\top ', '&#8868;');
LatexCmds.flat = bind(VanillaSymbol, '\\flat ', '&#9837;');
LatexCmds.natural = bind(VanillaSymbol, '\\natural ', '&#9838;');
LatexCmds.sharp = bind(VanillaSymbol, '\\sharp ', '&#9839;');
LatexCmds.wp = bind(VanillaSymbol, '\\wp ', '&#8472;');
LatexCmds.bot = bind(VanillaSymbol, '\\bot ', '&#8869;');
LatexCmds.clubsuit = bind(VanillaSymbol, '\\clubsuit ', '&#9827;');
LatexCmds.diamondsuit = bind(VanillaSymbol, '\\diamondsuit ', '&#9826;');
LatexCmds.heartsuit = bind(VanillaSymbol, '\\heartsuit ', '&#9825;');
LatexCmds.spadesuit = bind(VanillaSymbol, '\\spadesuit ', '&#9824;');

//variable-sized
LatexCmds.oint = bind(VanillaSymbol, '\\oint ', '&#8750;');
LatexCmds.bigcap = bind(VanillaSymbol, '\\bigcap ', '&#8745;');
LatexCmds.bigcup = bind(VanillaSymbol, '\\bigcup ', '&#8746;');
LatexCmds.bigsqcup = bind(VanillaSymbol, '\\bigsqcup ', '&#8852;');
LatexCmds.bigvee = bind(VanillaSymbol, '\\bigvee ', '&#8744;');
LatexCmds.bigwedge = bind(VanillaSymbol, '\\bigwedge ', '&#8743;');
LatexCmds.bigodot = bind(VanillaSymbol, '\\bigodot ', '&#8857;');
LatexCmds.bigotimes = bind(VanillaSymbol, '\\bigotimes ', '&#8855;');
LatexCmds.bigoplus = bind(VanillaSymbol, '\\bigoplus ', '&#8853;');
LatexCmds.biguplus = bind(VanillaSymbol, '\\biguplus ', '&#8846;');

//delimiters
LatexCmds.lfloor = bind(VanillaSymbol, '\\lfloor ', '&#8970;');
LatexCmds.rfloor = bind(VanillaSymbol, '\\rfloor ', '&#8971;');
LatexCmds.lceil = bind(VanillaSymbol, '\\lceil ', '&#8968;');
LatexCmds.rceil = bind(VanillaSymbol, '\\rceil ', '&#8969;');
LatexCmds.slash = bind(VanillaSymbol, '\\slash ', '&#47;');
LatexCmds.opencurlybrace = bind(VanillaSymbol, '\\opencurlybrace ', '&#123;');
LatexCmds.closecurlybrace = bind(VanillaSymbol, '\\closecurlybrace ', '&#125;');

//various symbols

LatexCmds.caret = bind(VanillaSymbol,'\\caret ','^');
LatexCmds.underscore = bind(VanillaSymbol,'\\underscore ','_');
LatexCmds.backslash = bind(VanillaSymbol,'\\backslash ','\\');
LatexCmds.vert = bind(VanillaSymbol,'|');
LatexCmds.perp = LatexCmds.perpendicular = bind(VanillaSymbol,'\\perp ','&perp;');
LatexCmds.nabla = LatexCmds.del = bind(VanillaSymbol,'\\nabla ','&nabla;');
LatexCmds.hbar = bind(VanillaSymbol,'\\hbar ','&#8463;');

LatexCmds.AA = LatexCmds.Angstrom = LatexCmds.angstrom =
  bind(VanillaSymbol,'\\text\\AA ','&#8491;');

LatexCmds.ring = LatexCmds.circ = LatexCmds.circle =
  bind(VanillaSymbol,'\\circ ','&#8728;');

LatexCmds.bull = LatexCmds.bullet = bind(VanillaSymbol,'\\bullet ','&bull;');

LatexCmds.setminus = LatexCmds.smallsetminus =
  bind(VanillaSymbol,'\\setminus ','&#8726;');

LatexCmds.not = //bind(Symbol,'\\not ','<span class="not">/</span>');
LatexCmds['¬'] = LatexCmds.neg = bind(VanillaSymbol,'\\neg ','&not;');

LatexCmds['…'] = LatexCmds.dots = LatexCmds.ellip = LatexCmds.hellip =
LatexCmds.ellipsis = LatexCmds.hellipsis =
  bind(VanillaSymbol,'\\dots ','&hellip;');

LatexCmds.converges =
LatexCmds.darr = LatexCmds.dnarr = LatexCmds.dnarrow = LatexCmds.downarrow =
  bind(VanillaSymbol,'\\downarrow ','&darr;');

LatexCmds.dArr = LatexCmds.dnArr = LatexCmds.dnArrow = LatexCmds.Downarrow =
  bind(VanillaSymbol,'\\Downarrow ','&dArr;');

LatexCmds.diverges = LatexCmds.uarr = LatexCmds.uparrow =
  bind(VanillaSymbol,'\\uparrow ','&uarr;');

LatexCmds.uArr = LatexCmds.Uparrow = bind(VanillaSymbol,'\\Uparrow ','&uArr;');

LatexCmds.to = bind(BinaryOperator,'\\to ','&rarr;');

LatexCmds.rarr = LatexCmds.rightarrow = bind(VanillaSymbol,'\\rightarrow ','&rarr;');

LatexCmds.implies = bind(BinaryOperator,'\\Rightarrow ','&rArr;');

LatexCmds.rArr = LatexCmds.Rightarrow = bind(VanillaSymbol,'\\Rightarrow ','&rArr;');

LatexCmds.gets = bind(BinaryOperator,'\\gets ','&larr;');

LatexCmds.larr = LatexCmds.leftarrow = bind(VanillaSymbol,'\\leftarrow ','&larr;');

LatexCmds.impliedby = bind(BinaryOperator,'\\Leftarrow ','&lArr;');

LatexCmds.lArr = LatexCmds.Leftarrow = bind(VanillaSymbol,'\\Leftarrow ','&lArr;');

LatexCmds.harr = LatexCmds.lrarr = LatexCmds.leftrightarrow =
  bind(VanillaSymbol,'\\leftrightarrow ','&harr;');

LatexCmds.iff = bind(BinaryOperator,'\\Leftrightarrow ','&hArr;');

LatexCmds.hArr = LatexCmds.lrArr = LatexCmds.Leftrightarrow =
  bind(VanillaSymbol,'\\Leftrightarrow ','&hArr;');

LatexCmds.Re = LatexCmds.Real = LatexCmds.real = bind(VanillaSymbol,'\\Re ','&real;');

LatexCmds.Im = LatexCmds.imag =
LatexCmds.image = LatexCmds.imagin = LatexCmds.imaginary = LatexCmds.Imaginary =
  bind(VanillaSymbol,'\\Im ','&image;');

LatexCmds.part = LatexCmds.partial = bind(VanillaSymbol,'\\partial ','&part;');

LatexCmds.inf = LatexCmds.infin = LatexCmds.infty = LatexCmds.infinity =
  bind(VanillaSymbol,'\\infty ','&infin;');

LatexCmds.alef = LatexCmds.alefsym = LatexCmds.aleph = LatexCmds.alephsym =
  bind(VanillaSymbol,'\\aleph ','&alefsym;');

LatexCmds.xist = //LOL
LatexCmds.xists = LatexCmds.exist = LatexCmds.exists =
  bind(VanillaSymbol,'\\exists ','&exist;');
LatexCmds.nexists = bind(VanillaSymbol,'\\nexists','&#8708;');

LatexCmds.and = LatexCmds.land = LatexCmds.wedge =
  bind(VanillaSymbol,'\\wedge ','&and;');

LatexCmds.or = LatexCmds.lor = LatexCmds.vee = bind(VanillaSymbol,'\\vee ','&or;');

// LatexCmds.o =
// LatexCmds.O =
LatexCmds.empty = LatexCmds.emptyset =
LatexCmds.oslash = LatexCmds.Oslash =
LatexCmds.nothing = LatexCmds.varnothing =
  bind(BinaryOperator,'\\varnothing ','&empty;');

LatexCmds.cup = LatexCmds.union = bind(BinaryOperator,'\\cup ','&cup;');

LatexCmds.cap = LatexCmds.intersect = LatexCmds.intersection =
  bind(BinaryOperator,'\\cap ','&cap;');

LatexCmds.deg = LatexCmds.degree = bind(VanillaSymbol,'^\\circ ','&deg;');

LatexCmds.ang = LatexCmds.angle = bind(VanillaSymbol,'\\angle ','&ang;');
LatexCmds.mang = LatexCmds.measuredangle = bind(VanillaSymbol,'\\measuredangle ','&#8737;');

var NonItalicizedFunction = P(Symbol, function(_, _super) {
  _.init = function(fn) {
    _super.init.call(this, '\\'+fn+' ', '<span>'+fn+'</span>');
  };
  _.respace = function()
  {
    this.jQ[0].className =
      (this.next instanceof SupSub || this.next instanceof Bracket) ?
      '' : 'non-italicized-function';
  };
});

LatexCmds.ln =
LatexCmds.lg =
LatexCmds.log =
LatexCmds.span =
LatexCmds.proj =
LatexCmds.det =
LatexCmds.dim =
LatexCmds.min =
LatexCmds.max =
LatexCmds.mod =
LatexCmds.lcm =
LatexCmds.gcd =
LatexCmds.gcf =
LatexCmds.hcf =
LatexCmds.lim = NonItalicizedFunction;

(function() {
  var trig = ['sin', 'cos', 'tan', 'sec', 'cosec', 'csc', 'cotan', 'cot'];
  for (var i in trig) {
    LatexCmds[trig[i]] =
    LatexCmds[trig[i]+'h'] =
    LatexCmds['a'+trig[i]] = LatexCmds['arc'+trig[i]] =
    LatexCmds['a'+trig[i]+'h'] = LatexCmds['arc'+trig[i]+'h'] =
      NonItalicizedFunction;
  }
}());

// Parser MathCommand
var latexMathParser = (function() {
  function commandToBlock(cmd) {
    var block = MathBlock();
    cmd.adopt(block, 0, 0);
    return block;
  }
  function joinBlocks(blocks) {
    var firstBlock = blocks[0] || MathBlock();

    for (var i = 1; i < blocks.length; i += 1) {
      blocks[i].children().adopt(firstBlock, firstBlock.lastChild, 0);
    }

    return firstBlock;
  }

  var string = Parser.string;
  var regex = Parser.regex;
  var letter = Parser.letter;
  var any = Parser.any;
  var optWhitespace = Parser.optWhitespace;
  var succeed = Parser.succeed;
  var fail = Parser.fail;

  // Parsers yielding MathCommands
  var variable = letter.map(Variable);
  var symbol = regex(/^[^${}\\_^]/).map(VanillaSymbol);

  var controlSequence =
    regex(/^[^\\]/)
    .or(string('\\').then(
      regex(/^[a-z]+/i)
      .or(regex(/^\s+/).result(' '))
      .or(any)
    )).then(function(ctrlSeq) {
      var cmdKlass = LatexCmds[ctrlSeq];

      if (cmdKlass) {
        return cmdKlass(ctrlSeq).parser();
      }
      else {
        return fail('unknown command: \\'+ctrlSeq);
      }
    })
  ;

  var command =
    controlSequence
    .or(variable)
    .or(symbol)
  ;

  // Parsers yielding MathBlocks
  var mathGroup = string('{').then(function() { return mathSequence; }).skip(string('}'));
  var mathBlock = optWhitespace.then(mathGroup.or(command.map(commandToBlock)));
  var mathSequence = mathBlock.many().map(joinBlocks).skip(optWhitespace);

  var optMathBlock =
    string('[').then(
      mathBlock.then(function(block) {
        return block.join('latex') !== ']' ? succeed(block) : fail();
      })
      .many().map(joinBlocks).skip(optWhitespace)
    ).skip(string(']'))
  ;

  var latexMath = mathSequence;

  latexMath.block = mathBlock;
  latexMath.optBlock = optMathBlock;
  return latexMath;
})();
/********************************************
 * Cursor and Selection "singleton" classes
 *******************************************/

/* The main thing that manipulates the Math DOM. Makes sure to manipulate the
HTML DOM to match. */

/* Sort of singletons, since there should only be one per editable math
textbox, but any one HTML document can contain many such textboxes, so any one
JS environment could actually contain many instances. */

//A fake cursor in the fake textbox that the math is rendered in.
var Cursor = P(function(_) {
  _.init = function(root) {
    this.parent = this.root = root;
    var jQ = this.jQ = this._jQ = $('<span class="cursor">&zwj;</span>');

    //closured for setInterval
    this.blink = function(){ jQ.toggleClass('blink'); }

    this.upDownCache = {};
  };

  _.prev = 0;
  _.next = 0;
  _.parent = 0;
  _.show = function() {
    this.jQ = this._jQ.removeClass('blink');
    if ('intervalId' in this) //already was shown, just restart interval
      clearInterval(this.intervalId);
    else { //was hidden and detached, insert this.jQ back into HTML DOM
      if (this.next) {
        if (this.selection && this.selection.first.prev === this.prev)
          this.jQ.insertBefore(this.selection.jQ);
        else
          this.jQ.insertBefore(this.next.jQ.first());
      }
      else
        this.jQ.appendTo(this.parent.jQ);
      this.parent.focus();
    }
    this.intervalId = setInterval(this.blink, 500);
    return this;
  };
  _.hide = function() {
    if ('intervalId' in this)
      clearInterval(this.intervalId);
    delete this.intervalId;
    this.jQ.detach();
    this.jQ = $();
    return this;
  };
  _.insertAt = function(parent, prev, next) {
    var old_parent = this.parent;

    this.parent = parent;
    this.prev = prev;
    this.next = next;

    old_parent.blur(); //blur may need to know cursor's destination
  };
  _.insertBefore = function(el) {
    this.insertAt(el.parent, el.prev, el)
    this.parent.jQ.addClass('hasCursor');
    this.jQ.insertBefore(el.jQ.first());
    return this;
  };
  _.insertAfter = function(el) {
    this.insertAt(el.parent, el, el.next);
    this.parent.jQ.addClass('hasCursor');
    this.jQ.insertAfter(el.jQ.last());
    return this;
  };
  _.prependTo = function(el) {
    this.insertAt(el, 0, el.firstChild);
    if (el.textarea) //never insert before textarea
      this.jQ.insertAfter(el.textarea);
    else
      this.jQ.prependTo(el.jQ);
    el.focus();
    return this;
  };
  _.appendTo = function(el) {
    this.insertAt(el, el.lastChild, 0);
    this.jQ.appendTo(el.jQ);
    el.focus();
    return this;
  };
  _.hopLeft = function() {
    this.jQ.insertBefore(this.prev.jQ.first());
    this.next = this.prev;
    this.prev = this.prev.prev;
    return this;
  };
  _.hopRight = function() {
    this.jQ.insertAfter(this.next.jQ.last());
    this.prev = this.next;
    this.next = this.next.next;
    return this;
  };
  _.moveLeftWithin = function(block) {
    if (this.prev) {
      if (this.prev.lastChild) this.appendTo(this.prev.lastChild)
      else this.hopLeft();
    }
    else {
      // we're at the beginning of the containing block, so do nothing.
      if (this.parent === block) return;

      if (this.parent.prev) this.appendTo(this.parent.prev);
      else this.insertBefore(this.parent.parent);
    }
  };
  _.moveRightWithin = function(block) {
    if (this.next) {
      if (this.next.firstChild) this.prependTo(this.next.firstChild)
      else this.hopRight();
    }
    else {
      // we're at the end of the containing block, so do nothing.
      if (this.parent === block) return;

      if (this.parent.next) this.prependTo(this.parent.next);
      else this.insertAfter(this.parent.parent);
    }
  };
  _.moveLeft = function() {
    clearUpDownCache(this);

    if (this.selection)
      this.insertBefore(this.selection.first).clearSelection();
    else {
      this.moveLeftWithin(this.root);
    }
    return this.show();
  };
  _.moveRight = function() {
    clearUpDownCache(this);

    if (this.selection)
      this.insertAfter(this.selection.last).clearSelection();
    else {
      this.moveRightWithin(this.root);
    }
    return this.show();
  };

  /**
   * moveUp and moveDown have almost identical algorithms:
   * - first check next and prev, if so prepend/appendTo them
   * - else check the parent's 'up'/'down' property - if it's a function,
   *   call it with the cursor as the sole argument and use the return value.
   *
   *   Given undefined, will bubble up to the next ancestor block.
   *   Given false, will stop bubbling.
   *   Given a MathBlock,
   *     + moveUp will appendTo it
   *     + moveDown will prependTo it
   *
   */
  _.moveUp = function() { return moveUpDown(this, 'up'); };
  _.moveDown = function() { return moveUpDown(this, 'down'); };
  function moveUpDown(self, dir) {
    if (self.next[dir]) self.prependTo(self.next[dir]);
    else if (self.prev[dir]) self.appendTo(self.prev[dir]);
    else {
      var ancestorBlock = self.parent;
      do {
        var prop = ancestorBlock[dir];
        if (prop) {
          if (typeof prop === 'function') prop = ancestorBlock[dir](self);
          if (prop === false || prop instanceof MathBlock) {
            self.upDownCache[ancestorBlock.id] = { parent: self.parent, prev: self.prev, next: self.next };

            if (prop instanceof MathBlock) {
              var cached = self.upDownCache[prop.id];

              if (cached) {
                if (cached.next) {
                  self.insertBefore(cached.next);
                } else {
                  self.appendTo(cached.parent);
                }
              } else {
                var pageX = offset(self).left;
                self.appendTo(prop);
                self.seekHoriz(pageX, prop);
              }
            }
            break;
          }
        }
        ancestorBlock = ancestorBlock.parent.parent;
      } while (ancestorBlock);
    }

    return self.clearSelection().show();
  }

  _.seek = function(target, pageX, pageY) {
    clearUpDownCache(this);
    var cmd, block, cursor = this.clearSelection().show();
    if (target.hasClass('empty')) {
      cursor.prependTo(MathElement[target.attr(mqBlockId)]);
      return cursor;
    }

    cmd = MathElement[target.attr(mqCmdId)];
    if (cmd instanceof Symbol) { //insert at whichever side is closer
      if (target.outerWidth() > 2*(pageX - target.offset().left))
        cursor.insertBefore(cmd);
      else
        cursor.insertAfter(cmd);

      return cursor;
    }
    if (!cmd) {
      block = MathElement[target.attr(mqBlockId)];
      if (!block) { //if no MathQuill data, try parent, if still no, just start from the root
        target = target.parent();
        cmd = MathElement[target.attr(mqCmdId)];
        if (!cmd) {
          block = MathElement[target.attr(mqBlockId)];
          if (!block) block = cursor.root;
        }
      }
    }

    if (cmd)
      cursor.insertAfter(cmd);
    else
      cursor.appendTo(block);

    return cursor.seekHoriz(pageX, cursor.root);
  };
  _.seekHoriz = function(pageX, block) {
    //move cursor to position closest to click
    var cursor = this;
    var dist = offset(cursor).left - pageX;
    var prevDist;

    do {
      cursor.moveLeftWithin(block);
      prevDist = dist;
      dist = offset(cursor).left - pageX;
    }
    while (dist > 0 && (cursor.prev || cursor.parent !== block));

    if (-dist > prevDist) cursor.moveRightWithin(block);

    return cursor;
  };
  function offset(self) {
    //in Opera 11.62, .getBoundingClientRect() and hence jQuery::offset()
    //returns all 0's on inline elements with negative margin-right (like
    //the cursor) at the end of their parent, so temporarily remove the
    //negative margin-right when calling jQuery::offset()
    //Opera bug DSK-360043
    //http://bugs.jquery.com/ticket/11523
    //https://github.com/jquery/jquery/pull/717
    var offset = self.jQ.removeClass('cursor').offset();
    self.jQ.addClass('cursor');
    return offset;
  }
  _.writeLatex = function(latex) {
    var self = this;
    clearUpDownCache(self);
    self.show().deleteSelection();

    var all = Parser.all;
    var eof = Parser.eof;

    var block = latexMathParser.skip(eof).or(all.result(false)).parse(latex);

    if (block) {
      block.children().adopt(self.parent, self.prev, self.next);
      MathElement.jQize(block.join('html')).insertBefore(self.jQ);
      self.prev = block.lastChild;
      block.finalizeInsert();
      self.parent.bubble('redraw');
    }

    return this.hide();
  };
  _.write = function(ch) {
    clearUpDownCache(this);
    return this.show().insertCh(ch);
  };
  _.insertCh = function(ch) {
    var cmd;
    if (ch.match(/^[a-eg-zA-Z]$/)) //exclude f because want florin
      cmd = Variable(ch);
    else if (cmd = CharCmds[ch] || LatexCmds[ch])
      cmd = cmd(ch);
    else
      cmd = VanillaSymbol(ch);

    if (this.selection) {
      this.prev = this.selection.first.prev;
      this.next = this.selection.last.next;
      cmd.replaces(this.selection);
      delete this.selection;
    }

    return this.insertNew(cmd);
  };
  _.insertNew = function(cmd) {
    cmd.createBefore(this);
    return this;
  };
  _.insertCmd = function(latexCmd, replacedFragment) {
    var cmd = LatexCmds[latexCmd];
    if (cmd) {
      cmd = cmd(latexCmd);
      if (replacedFragment) cmd.replaces(replacedFragment);
      this.insertNew(cmd);
    }
    else {
      cmd = TextBlock();
      cmd.replaces(latexCmd);
      cmd.firstChild.focus = function(){ delete this.focus; return this; };
      this.insertNew(cmd).insertAfter(cmd);
      if (replacedFragment)
        replacedFragment.remove();
    }
    return this;
  };
  _.unwrapGramp = function() {
    var gramp = this.parent.parent;
    var greatgramp = gramp.parent;
    var next = gramp.next;
    var cursor = this;

    var prev = gramp.prev;
    gramp.disown().eachChild(function(uncle) {
      if (uncle.isEmpty()) return;

      uncle.children()
        .adopt(greatgramp, prev, next)
        .each(function(cousin) {
          cousin.jQ.insertBefore(gramp.jQ.first());
        })
      ;

      prev = uncle.lastChild;
    });

    if (!this.next) { //then find something to be next to insertBefore
      if (this.prev)
        this.next = this.prev.next;
      else {
        while (!this.next) {
          this.parent = this.parent.next;
          if (this.parent)
            this.next = this.parent.firstChild;
          else {
            this.next = gramp.next;
            this.parent = greatgramp;
            break;
          }
        }
      }
    }
    if (this.next)
      this.insertBefore(this.next);
    else
      this.appendTo(greatgramp);

    gramp.jQ.remove();

    if (gramp.prev)
      gramp.prev.respace();
    if (gramp.next)
      gramp.next.respace();
  };
  _.backspace = function() {
    clearUpDownCache(this);
    this.show();

    if (this.deleteSelection()); // pass
    else if (this.prev) {
      if (this.prev.isEmpty())
        this.prev = this.prev.remove().prev;
      else
        this.selectLeft();
    }
    else if (this.parent !== this.root) {
      if (this.parent.parent.isEmpty())
        return this.insertAfter(this.parent.parent).backspace();
      else
        this.unwrapGramp();
    }

    if (this.prev)
      this.prev.respace();
    if (this.next)
      this.next.respace();
    this.parent.bubble('redraw');

    return this;
  };
  _.deleteForward = function() {
    clearUpDownCache(this);
    this.show();

    if (this.deleteSelection()); // pass
    else if (this.next) {
      if (this.next.isEmpty())
        this.next = this.next.remove().next;
      else
        this.selectRight();
    }
    else if (this.parent !== this.root) {
      if (this.parent.parent.isEmpty())
        return this.insertBefore(this.parent.parent).deleteForward();
      else
        this.unwrapGramp();
    }

    if (this.prev)
      this.prev.respace();
    if (this.next)
      this.next.respace();
    this.parent.bubble('redraw');

    return this;
  };
  _.selectFrom = function(anticursor) {
    //find ancestors of each with common parent
    var oneA = this, otherA = anticursor; //one ancestor, the other ancestor
    loopThroughAncestors: while (true) {
      for (var oneI = this; oneI !== oneA.parent.parent; oneI = oneI.parent.parent) //one intermediate, the other intermediate
        if (oneI.parent === otherA.parent) {
          left = oneI;
          right = otherA;
          break loopThroughAncestors;
        }

      for (var otherI = anticursor; otherI !== otherA.parent.parent; otherI = otherI.parent.parent)
        if (oneA.parent === otherI.parent) {
          left = oneA;
          right = otherI;
          break loopThroughAncestors;
        }

      if (oneA.parent.parent)
        oneA = oneA.parent.parent;
      if (otherA.parent.parent)
        otherA = otherA.parent.parent;
    }
    //figure out which is left/prev and which is right/next
    var left, right, leftRight;
    if (left.next !== right) {
      for (var next = left; next; next = next.next) {
        if (next === right.prev) {
          leftRight = true;
          break;
        }
      }
      if (!leftRight) {
        leftRight = right;
        right = left;
        left = leftRight;
      }
    }
    this.hide().selection = Selection(left.prev.next || left.parent.firstChild, right.next.prev || right.parent.lastChild);
    this.insertAfter(right.next.prev || right.parent.lastChild);
    this.root.selectionChanged();
  };
  _.selectLeft = function() {
    clearUpDownCache(this);
    if (this.selection) {
      if (this.selection.first === this.next) { //if cursor is at left edge of selection;
        if (this.prev) //then extend left if possible
          this.hopLeft().selection.extendLeft();
        else if (this.parent !== this.root) //else level up if possible
          this.insertBefore(this.parent.parent).selection.levelUp();
      }
      else { //else cursor is at right edge of selection, retract left if possible
        this.hopLeft();
        if (this.selection.first === this.selection.last) {
          this.clearSelection().show(); //clear selection if retracting to nothing
          return; //skip this.root.selectionChanged(), this.clearSelection() does it anyway
        }
        this.selection.retractLeft();
      }
    }
    else {
      if (this.prev)
        this.hopLeft();
      else //end of a block
        if (this.parent !== this.root)
          this.insertBefore(this.parent.parent);
        else
          return;

      this.hide().selection = Selection(this.next);
    }
    this.root.selectionChanged();
  };
  _.selectRight = function() {
    clearUpDownCache(this);
    if (this.selection) {
      if (this.selection.last === this.prev) { //if cursor is at right edge of selection;
        if (this.next) //then extend right if possible
          this.hopRight().selection.extendRight();
        else if (this.parent !== this.root) //else level up if possible
          this.insertAfter(this.parent.parent).selection.levelUp();
      }
      else { //else cursor is at left edge of selection, retract right if possible
        this.hopRight();
        if (this.selection.first === this.selection.last) {
          this.clearSelection().show(); //clear selection if retracting to nothing
          return; //skip this.root.selectionChanged(), this.clearSelection() does it anyway
        }
        this.selection.retractRight();
      }
    }
    else {
      if (this.next)
        this.hopRight();
      else //end of a block
        if (this.parent !== this.root)
          this.insertAfter(this.parent.parent);
        else
          return;

      this.hide().selection = Selection(this.prev);
    }
    this.root.selectionChanged();
  };

  function clearUpDownCache(self) {
    self.upDownCache = {};
  }

  _.prepareMove = function() {
    clearUpDownCache(this);
    return this.show().clearSelection();
  };

  _.prepareEdit = function() {
    clearUpDownCache(this);
    return this.show().deleteSelection();
  }

  _.clearSelection = function() {
    if (this.selection) {
      this.selection.clear();
      delete this.selection;
      this.root.selectionChanged();
    }
    return this;
  };
  _.deleteSelection = function() {
    if (!this.selection) return false;

    this.prev = this.selection.first.prev;
    this.next = this.selection.last.next;
    this.selection.remove();
    this.root.selectionChanged();
    return delete this.selection;
  };
});

var Selection = P(MathFragment, function(_, _super) {
  _.init = function() {
    var frag = this;
    _super.init.apply(frag, arguments);

    frag.jQwrap(frag.jQ);
  };
  _.jQwrap = function(children) {
    this.jQ = children.wrapAll('<span class="selection"></span>').parent();
      //can't do wrapAll(this.jQ = $(...)) because wrapAll will clone it
  };
  _.adopt = function() {
    this.jQ.replaceWith(this.jQ = this.jQ.children());
    return _super.adopt.apply(this, arguments);
  };
  _.clear = function() {
    this.jQ.replaceWith(this.jQ.children());
    return this;
  };
  _.levelUp = function() {
    var seln = this,
      gramp = seln.first = seln.last = seln.last.parent.parent;
    seln.clear().jQwrap(gramp.jQ);
    return seln;
  };
  _.extendLeft = function() {
    this.first = this.first.prev;
    this.first.jQ.prependTo(this.jQ);
  };
  _.extendRight = function() {
    this.last = this.last.next;
    this.last.jQ.appendTo(this.jQ);
  };
  _.retractRight = function() {
    this.first.jQ.insertBefore(this.jQ);
    this.first = this.first.next;
  };
  _.retractLeft = function() {
    this.last.jQ.insertAfter(this.jQ);
    this.last = this.last.prev;
  };
});
/*********************************************************
 * The actual jQuery plugin and document ready handlers.
 ********************************************************/

//The publicy exposed method of jQuery.prototype, available (and meant to be
//called) on jQuery-wrapped HTML DOM elements.
$.fn.mathquill = function(cmd, latex) {
  switch (cmd) {
  case 'redraw':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        rootBlock = blockId && MathElement[blockId];
      if (rootBlock) {
        (function postOrderRedraw(el) {
          el.eachChild(postOrderRedraw);
          if (el.redraw) el.redraw();
        }(rootBlock));
      }
    });
  case 'revert':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId];
      if (block && block.revert)
        block.revert();
    });
  case 'latex':
    if (arguments.length > 1) {
      return this.each(function() {
        var blockId = $(this).attr(mqBlockId),
          block = blockId && MathElement[blockId];
        if (block)
          block.renderLatex(latex);
      });
    }

    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId];
    return block && block.latex();
  case 'text':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId];
    return block && block.text();
  case 'html':
    return this.html().replace(/ ?hasCursor|hasCursor /, '')
      .replace(/ class=(""|(?= |>))/g, '')
      .replace(/<span class="?cursor( blink)?"?><\/span>/i, '')
      .replace(/<span class="?textarea"?><textarea><\/textarea><\/span>/i, '');
  case 'write':
    if (arguments.length > 1)
      return this.each(function() {
        var blockId = $(this).attr(mqBlockId),
          block = blockId && MathElement[blockId],
          cursor = block && block.cursor;

        if (cursor)
          cursor.writeLatex(latex).parent.blur();
      });
  case 'cmd':
    if (arguments.length > 1)
      return this.each(function() {
        var blockId = $(this).attr(mqBlockId),
          block = blockId && MathElement[blockId],
          cursor = block && block.cursor;

        if (cursor) {
          cursor.show();
          if (/^\\[a-z]+$/i.test(latex)) {
            var selection = cursor.selection;
            if (selection) {
              cursor.prev = selection.first.prev;
              cursor.next = selection.last.next;
              delete cursor.selection;
            }
            cursor.insertCmd(latex.slice(1), selection);
          }
          else
            cursor.insertCh(latex);
          cursor.hide().parent.blur();
        }
      });
  default:
    var textbox = cmd === 'textbox',
      editable = textbox || cmd === 'editable',
      RootBlock = textbox ? RootTextBlock : RootMathBlock;
    return this.each(function() {
      createRoot($(this), RootBlock(), textbox, editable);
    });
  }
};

//on document ready, mathquill-ify all `<tag class="mathquill-*">latex</tag>`
//elements according to their CSS class.
$(function() {
  $('.mathquill-editable:not(.mathquill-rendered-math)').mathquill('editable');
  $('.mathquill-textbox:not(.mathquill-rendered-math)').mathquill('textbox');
  $('.mathquill-embedded-latex').mathquill();
});


}());
;Drupal.behaviors.sTinymceMathquill = function(context){
  // initialize formula editor elements
  $('.s-formula-editable:not(.sTinymceMathquill-processed)', context).addClass('sTinymceMathquill-processed').each(function(){
    sMathquill.initMathquill(this);
  });

  var popup = Popups.activePopup();
  if(!popup || !$('#' + popup.id).hasClass('tinymce-mathquill-formula-popup')) return;

  var latexLoading = false;

  $('.submit-btn', context).click(function(e){
    e.preventDefault();

    var realm = tinyMCE.activeEditor.execCommand('sContentGetRealmFromUrl');
    var latex = sMathquill.save();

    if(latex && latex.length && !latexLoading){
      var encodedFormula = Base64.encode(latex);
      latexLoading = true;
      $.ajax({
        url: '/tinymceinsertlatex',
        type: 'POST',
        dataType: 'json',
        data: { save_formula: 1 , realm: realm[0], realm_id: realm[1], formula: latex },
        success: function( data, status, xhr ){
          latexLoading = false;
          if( data.error ) {
            alert( data.error );
          }
          else {
            // remove the modded formula image
            var old_image = $(document).data('s_content_saved_formula_image');
            if(old_image) {
              $(old_image).remove();
              // clear out the lastNode value
              tinyMCE.activeEditor.execCommand('sContentSaveLastNode');
            }

            $(document).data('s_content_saved_formula_image',null);

            Popups.close();

            var imgElement = '<img src="' + data.content_path + '" formula="' + encodedFormula + '" class="mathquill-formula" />';
            tinyMCE.activeEditor.execCommand('sContentInsert' , imgElement, {use_native_insert: true});
          }
        }
      });
    }
  });
};

if(typeof sMathquill == 'undefined'){
  sMathquill = (function(){
    var obj = {};
    obj.editors = [];
    obj.activeEditor = null;
    obj.config = {};
    obj.menuItemList = {};

    /**
     * Initialize a new markup element to be placed in a menu bar
     *
     * @param object cfg
     */
    _newMarkup = function(cfg){
      return {
        type: 'markup',
        html: cfg.html
      };
    };

    /**
     * Initialize a new command button
     * Executes a command in Mathquill and triggers a refocus.
     *
     * @param object cfg
     */
    _newCommandButton = function(cfg){
      var cmd = typeof cfg.cmd == 'object' ? cfg.cmd.join('') : cfg.cmd;
      return {
        type: 'button',
        extraClass: 's-mq-btn s-mq-icon',
        label: cmd,
        tooltip: cmd.replace('\\', ''),
        fn: function(args){
          args.event.preventDefault();
          if(typeof cfg.cmd == 'object'){
            $.each(cfg.cmd, function(k, cmd){
              args.editor.mathquill('cmd', cmd);
            });
          }
          else{
            args.editor.mathquill('cmd', cfg.cmd);
          }
          args.editor.trigger('focus');
        }
      };
    };

    /**
     * Initialize a new text button
     * Executes a write in Mathquill and triggers a refocus.
     *
     * @param object cfg
     */
    _newTextButton = function(cfg){
      return {
        type: 'button',
        extraClass: 's-mq-btn s-mq-icon',
        label: cfg.text,
        tooltip: cfg.text,
        fn: function(args){
          args.event.preventDefault();
          args.editor.mathquill('write', cfg.text);
          args.editor.trigger('focus');
        }
      };
    };

    /**
     * Initialize a new menu toggle button that toggles visibility of sub menus and refocuses on the editor
     *
     * @param object cfg
     */
    _newMenuToggleButton = function(cfg){
      var menuClass = 's-mq-' + cfg.key.replace(/_/g, '-').toLowerCase();
      return {
        type: 'button',
        extraClass: 's-mq-btn s-mq-menu-toggle',
        label: cfg.label,
        tooltip: cfg.label,
        fn: function(args){
          var e = args.event,
              ed = args.editor;
          e.preventDefault();
          var btnObj = $(this);
          if(btnObj.hasClass('active')){
            //closing a menu
            btnObj.removeClass('active');
            ed.siblings('.s-mq-submenu.' + menuClass).addClass('hidden');
          }
          else{
            //opening a menu
            btnObj.addClass('active')
                  .siblings('.s-mq-menu-toggle')
                  .removeClass('active');
            var subMenus = ed.siblings('.s-mq-submenu');
            subMenus.not('.' + menuClass).addClass('hidden');
            subMenus.filter('.' + menuClass).removeClass('hidden');
          }
          obj.resize();
          ed.trigger('focus');
        }
      };
    };

    /**
     * Initialize a default button.
     * This just adds an element to the DOM, any bindings will be done externally.
     * Function may be passed in to the fn member of cfg.
     *
     * @param object cfg
     */
    _newDefaultButton = function(cfg){
      var btn = {
        type: 'button',
        label: cfg.label,
        extraClass: 's-mq-btn'
      };
      if(typeof cfg.fn == 'function'){
        btn.fn = cfg.fn;
      }
      return btn
    };

    /**
     * Initialize Mathquill editor on a given element
     *
     * @param string/object selector or DOM element
     * @param object opts
     */
    obj.initMathquill = function(element, opts){
      var menuBars = null;
      if(typeof opts == 'undefined'){
        var opts = {};
      }
      var defaults = {
        editable: true,
        autoHeight: false
      };
      opts = $.extend(defaults, opts);

      // initialize Mathquill on the given element
      var el = $(element);
      if(opts.editable){
        el.index = obj.editors.length;
        el.menuBars = [];
        el.hooks = {};
        el.opts = opts;

        _execAllHooks('onBeforeEditorCreate', [el]);

        el.mathquill('editable');

        el.initialHeight = el.innerHeight();

        // set this element as the active editor
        obj.activeEditor = el;

        // bind the focus event to help identify the current editor
        el.find('textarea').bind('focus', function(){
          obj.activeEditor = el;
        });

        // add a command bar with a bunch of default buttons
        if(typeof obj.config.menu_bars != 'undefined'){
          $.each(obj.config.menu_bars, function(name, cfg){
            cfg.name = name;
            obj.addMenuBar(cfg);
          });
          this.resize();
        }

        obj.editors.push(el);

        _execAllHooks('onEditorCreate', [el]);
      }
      else{
        el.mathquill();
      }
      return el;
    };

    /**
     * Add a command bar to the active editor
     *
     * @param object opts
     *   string menuItem  comma separated list of keys representing a menu item
     *
     * @return object
     */
    obj.addMenuBar = function(opts){
      var ed = obj.activeEditor,
          menuItems = [];
      if(!ed){
        return;
      }

      if(typeof opts == 'undefined'){
        var opts = {};
      }
      var defaults = {
        submenu: false,
        multiline: false
      };
      opts = $.extend(defaults, opts);
      if(typeof opts.menu_items == 'object'){
        opts.menu_items = opts.menu_items.join(',');
      }
      if(typeof opts.menu_items == 'string'){
        $.each(opts.menu_items.split(','), function(idx, key){
          if(new_item = obj.getMenuItem(key)){
            menuItems.push(new_item);
          }
        });
      }

      var newBarObj = $('<div/>').addClass('s-mq-menu-bar');
      // newBarObj.width(ed.outerWidth() - 2);

      if(typeof opts.name == 'string'){
        newBarObj.addClass('s-mq-menu-' + opts.name.replace(/_/g, '-').toLowerCase());
      }

      if(typeof opts.submenu != 'undefined' && opts.submenu){
        newBarObj.addClass('s-mq-submenu').addClass('hidden');
      }

      if(typeof opts.multiline != 'undefined' && opts.multiline){
        newBarObj.addClass('s-mq-menu-multiline');
      }

      // put the menuItems in the menu bar if there are any
      if(menuItems.length){
        $.each(menuItems, function(i, menuItem){
          var newMenuItem = null;
          switch(menuItem.type){
            case 'button':
              newMenuItem = obj.addButtonToMenuBar(newBarObj, menuItem);
              break;

            case 'markup':
              newBarObj.append(menuItem.html);
              break;
          }

          if(!opts.submenu && newMenuItem){
            newMenuItem.addClass('s-mq-menu-item');
          }
        });
      }

      if(typeof opts.extraClass == 'string'){
        newBarObj.addClass(opts.extraClass);
      }

      newBarObj.insertBefore(ed);

      ed.menuBars.push(newBarObj);

      return newBarObj;
    };

    /**
     * Add a button to the menu bar
     *
     * @param int/object menuBar  provide int to reference a menu bar in the active editor
     *                            provide object of the menu bar object
     * @param object btn
     *
     * @return object
     */
    obj.addButtonToMenuBar = function(menuBar, btn){
      var menuBarObj = null,
          ed = obj.activeEditor;

      // set the menuBarObj by determining whether an object was passed or an int to reference the menuBar in the current editor
      if(typeof menuBar == 'object'){
        if(menuBar.hasClass('s-mq-menu-bar')){
          menuBarObj = menuBar;
        }
      }
      else if(typeof menuBar == 'number') {
        if(ed && typeof ed.menuBars[menuBar] == 'object'){
          menuBarObj = ed.menuBars[menuBar];
        }
      }

      if(!menuBarObj){
        return null;
      }

      var defaults = {
        label: '',
        extraClass: '',
        size: 20,
        fn: function() {}
      };
      btn = $.extend(defaults, btn);

      var btnObj = $('<span/>').bind('click', function(e){
        btn.fn.apply(this, [{editor: ed, event: e}]);
      });
      btnLabel = $('<span/>').addClass('s-mq-label').appendTo(btnObj);

      if(btn.label.length){
        btnLabel.text(btn.label);
      }

      if(btn.tooltip.length){
        btnObj.attr('title', btn.tooltip);
      }

      if(btn.extraClass.length){
        btnObj.addClass(btn.extraClass);
      }

      btnObj.addClass('s-mq-size' + btn.size);

      if(btnObj.hasClass('s-mq-embed')){
        // has latex command embedded
        // need to run mathquill on the label text and render it
        var renderedHTML = $('<span/>').text(btnLabel.text()).mathquill('editable').mathquill('html');
        btnLabel.html(renderedHTML).addClass('mathquill-rendered-math');
      }
      else{
        // does an html entities decode
        btnLabel.html(btnLabel.text());
      }

      btnObj.appendTo(menuBarObj);

      if(typeof btn.onAdd == 'function'){
        btn.onAdd.apply(obj, [btnObj]);
      }

      return btnObj;
    };

    /**
     * Retrieve the menu item object given the key.
     *
     * @param string key  unique key that defines a menu item
     */
    obj.getMenuItem = function(key){
      var template = null,
          cfg = null;
      if(typeof this.menuItemList[key] == 'undefined'){
        if(key.length){
          // if there is no config for it, create a standard command button
          cfg = {
            key: key,
            cmd: '\\' + key
          };
        }
      }
      else {
        cfg = this.menuItemList[key];
      }

      if(cfg){
        cfg.key = key;
        if(typeof cfg.html != 'undefined'){
          template = _newMarkup(cfg);
        }
        else if(typeof cfg.cmd != 'undefined'){
          // command button will trigger a cmd and refocus on the editor
          template = _newCommandButton(cfg);
        }
        else if(typeof cfg.text == 'string'){
          // text button will trigger a text call and refocus on the editor
          template = _newTextButton(cfg);
        }
        else if(typeof cfg.menu_toggle != 'undefined'){
          template = _newMenuToggleButton(cfg);
        }
        else{
          template = _newDefaultButton(cfg);
        }

        if(typeof template == 'object' && template){
          if(typeof template.extraClass == 'undefined'){
            template.extraClass = '';
          }

          // give the menu item a class with its key
          template.extraClass += ' s-mq-' + cfg.key.replace(/_/g, '-').toLowerCase();

          // can set the compile_label to false to prevent mathquilling the contents
          if(typeof cfg.compile_label != 'boolean' || cfg.compile_label){
            template.extraClass += ' s-mq-embed';
          }

          if(typeof cfg.extraClass == 'string'){
            template.extraClass += ' ' + cfg.extraClass;
          }

          // the tooltip that appears on mouseover
          if(typeof cfg.tooltip != 'undefined'){
            // use the tooltip that is defined in the config
            template.tooltip = cfg.tooltip;
          }
          else if(typeof template.tooltip == 'undefined'){
            // use the label as a
            template.tooltip = typeof template.label != 'undefined' ? template.label : key;
          }

          // use the label that is defined in the config
          if(typeof cfg.label != 'undefined'){
            template.label = cfg.label;
          }
        }
      }

      return template;
    };


    /**
     * Adjust the size of the editor to fit the menu bars.
     */
    obj.resize = function(){
      var ed = obj.activeEditor;
      if(ed && typeof ed.initialHeight != 'undefined' && typeof ed.opts.autoHeight != 'undefined' && ed.opts.autoHeight){
        var height = ed.initialHeight;
        if(ed.menuBars.length){
          $.each(ed.menuBars, function(k, menuBar){
            if(menuBar.is(':visible')){
              height -= menuBar.outerHeight();
            }
          });

          ed.height(height);
        }
      }
    };

    /**
     * Execute a command on the active editor if there is one.
     *
     * @param string cmd
     * @param mixed,... args
     */
    obj.exec = function(){
      var ed;
      if(ed = this.activeEditor){
        var args = Array.prototype.slice.call(arguments);
        return ed.mathquill.apply(ed, args);
      }

      return null;
    };

    /**
     * Convenience method to write to the active editor
     *
     * @param string latex
     */
    obj.write = function(latex){
      return obj.exec('write', latex);
    };

    /**
     * Convenience method for executing a Mathquill command on the active editor.
     *
     * @param string cmd
     */
    obj.cmd = function(cmd){
      return obj.exec('cmd', cmd);
    };

    /**
     * Convenience method for resetting the contents of the active editor.
     */
    obj.reset = function(){
      return obj.exec('revert');
    };

    /**
     * Convenience method to retrieve the latex representation of the formula in the active editor
     */
    obj.getLatex = function(){
      return obj.exec('latex');
    };

    /**
     * Convenience method to retrieve the HTML representation of the formula in the active editor
     */
    obj.getHTML = function(){
      return obj.exec('html');
    };

    /**
     * Saves the content.
     * Returns the final LaTeX after hooks have been run
     */
    obj.save = function(){
      var output = { latex: obj.getLatex() };
      // passing output as object so it will be passed to all hooks by reference and not by value
      _execAllHooks('onSave', [obj.activeEditor, output]);
      return output.latex;
    };

    var hook_namespaces = {};

    /**
     * Register a hook to the provided namespace and event queue.
     * May also provide an argument list as an array
     *
     * @param string namespace
     * @param string event
     * @param function fn
     */
    _addHook = function(namespace, event, fn){
      if(typeof hook_namespaces[namespace] == 'undefined'){
        hook_namespaces[namespace] = {};
      }
      if(typeof hook_namespaces[namespace][event] == 'undefined'){
        hook_namespaces[namespace][event] = [fn];
      }
      else{
        hook_namespaces[namespace][event].push(fn);
      }
    };

    /**
     * Execute the hooks associated with the event.
     * May also provide an argument list as an array
     *
     * @param string namespace
     * @param string event
     * @param array args
     */
    _execHooks = function(namespace, event, args){
      if(typeof hook_namespaces[namespace] == 'undefined'){
        return;
      }

      if(typeof hook_namespaces[namespace][event] == 'undefined'){
        return;
      }

      var hook_queue = hook_namespaces[namespace][event];

      if(typeof args == 'undefined'){
        var args = [];
      }

      $.each(hook_queue, function(k, fn){
        fn.apply(obj, args);
      });
    };

    /**
     * Execute the hooks associated with the event in the global namespace.
     * May also provide an argument list as an array
     *
     * @param string event
     * @param array args
     */
    _execGlobalHooks = function(event, args){
      _execHooks('global', event, args);
    };

    /**
     * Execute the hooks associated with the event for the current editor.
     * May also provide an argument list as an array
     *
     * @param string event
     * @param array args
     */
    _execEditorHooks = function(event, args){
      var ed = obj.activeEditor;

      if(ed){
        _execHooks('editor_' + ed.index, event, args);
      }
    };

    /**
     * Execute the hooks in all namespces for the given event
     * May also provide an argument list as an array
     *
     * @param string event
     * @param array args
     */
    _execAllHooks = function(event, args){
      $.each(hook_namespaces, function(namespace, queues){
        _execHooks(namespace, event, args);
      });
    };

    /**
     * Register a hook to be called in an event that's not associated with an editor
     *
     * @param string event
     * @param function fn
     */
    obj.addGlobalHook = function(event, fn){
      _addHook('global', event, fn);
    };

    /**
     * Register a hook to be called in an event on the current active editor
     *
     * @param string event
     * @param function fn
     */
    obj.addEditorHook = function(event, fn){
      var ed = obj.activeEditor;
      if(ed){
        _addHook('editor_' + ed.index, event, fn);
      }
    };

    return obj;
  })();

  /**
   * Mathquill editor configuration
   */
  sMathquill.config = {
    menu_bars: {}
  };

  /**
   * a list of menu item definitions
   *
   * string html - an html markup that can be inserted into a menu bar
   * string cmd - a Mathquill command that runs as a result of clicking on the button. creates a command button
   * string text - a Mathquill "write" that runs as a result of clicking on the button. creates a text button
   *
   * bool menu_toggle - the button is treated as a toggle, creates a menu toggle button
   * bool compile_label - defaults true. set to false to prevent the label from being compiled in Mathquill
   *
   * string label - the text that appears on the control
   * string tooltip - the text that appears on mouseover
   */
  sMathquill.menuItemList = {
    // markup
    _line_break:        { html: '<br/>' },
    _separator:         { html: '<span class="s-mq-separator"></span>' }
  };

  /**
   * Main menu buttons and cluetip roll-over on the buttons
   */
  (function(obj){
    var mainMenuConfig = {
      // main menus
      main: {
        menu_items: [
          // 'menu_greek,menu_operators,menu_relationships,menu_equations,menu_arrows,menu_misc'
          'menu_operators,menu_relationships,menu_equations,menu_arrows,menu_misc,menu_greek'
        ]
      },

      // sub menus
      greek: {
        submenu: true,
        multiline: true,
        menu_items: [
          'alpha,beta,gamma,delta,epsilon,zeta,eta,theta,iota,kappa,lambda,mu,nu,xi,omicron,pi,rho,sigma,tau,upsilon,phi,chi,psi,omega',
          'digamma,varepsilon,varkappa,varphi,varpi,varrho,varsigma,vartheta',
          'Gamma,Delta,Theta,Lambda,Xi,Pi,Sigma,Upsilon,Phi,Psi,Omega'
        ]
      },
      operators: {
        submenu: true,
        multiline: true,
        menu_items: [
          'equal,plus,minus,ast,cdot,times,div,pm,mp,therefore,because',
          'bigcirc,diamond,amalg,odot,ominus,oplus,otimes,wr',
          'union,intersect,uplus,sqcap,sqcup,wedge,vee,dagger,ddagger',
          'lhd,rhd,bigtriangledown,bigtriangleup'
        ]
      },
      relationships: {
        submenu: true,
        multiline: true,
        menu_items: [
          'equiv,cong,neq,sim,simeq,approx,napprox,doteq,models',
          'leq,prec,preceq,lt,ll,subset,subseteq,nsubset,nsubseteq,sqsubset,sqsubseteq,dashv,in,notin',
          'geq,succ,succeq,gt,gg,supset,supseteq,nsupset,nsupseteq,sqsupset,sqsupseteq,vdash,ni,notni',
          'mid,parallel,nparallel,perp,bowtie,smile,frown,propto,exists,nexists,varnothing'
        ]
      },
      equations: {
        submenu: true,
        multiline: true,
        menu_items: [
          'frac,fprime,sqrt,nthroot,supscript,subscript,curly_braces,angle_brackets,lfloor,rfloor,lceil,rceil,slash',
          'sum,prod,coprod,limit,int,oint,binomial,vector,prime'
        ]
      },
      arrows: {
        submenu: true,
        multiline: true,
        menu_items: [
          'leftarrow,Leftarrow,rightarrow,Rightarrow,leftrightarrow,Leftrightarrow',
          'longleftarrow,Longleftarrow,longrightarrow,Longrightarrow,longleftrightarrow,Longleftrightarrow',
          'rightleftarrows,uparrow,Uparrow,downarrow,Downarrow,updownarrow,Updownarrow',
          'mapsto,hookleftarrow,leftharpoonup,leftharpoondown,hookrightarrow,rightharpoonup,rightharpoondown',
          'nearrow,searrow,swarrow,nwarrow'
        ]
      },
      misc: {
        submenu: true,
        multiline: true,
        menu_items: [
          'infty,nabla,partial,clubsuit,diamondsuit,heartsuit,spadesuit,cdots,vdots,ldots,ddots,imaginary,real',
          'forall,reals,complex,naturals,rationals,integers,ell,sharp,flat,natural,hbar,surd,wp',
          'angle,measuredangle,overline,overrightarrow,overleftrightarrow,triangle,top,bot,caret,underscore,backslash,vert,AA',
          'circ,bullet,setminus,neg,dots,aleph,deg'
        ]
      }
    };
    var mainMenuButtons = {
      menu_greek:         { menu_toggle: true,
                            label: '\\alpha \\pi \\Delta',
                            tooltip: Drupal.t('Greek'),
                            extraClass: 's-mq-embed' },
      menu_operators:     { menu_toggle: true,
                            label: '\\pm\\times=',
                            tooltip: Drupal.t('Operators'),
                            extraClass: 's-mq-embed' },
      menu_relationships: { menu_toggle: true,
                            label: '\\leq\\ne\\in',
                            tooltip: Drupal.t('Relationships'),
                            extraClass: 's-mq-embed' },
      menu_equations:     { menu_toggle: true,
                            compile_label: false,
                            label: '<var class="florin">ƒ</var>'
                                 + '<span>\'</span>'
                                 + '<span class="non-leaf">{ }</span>'
                                 + '<span class="non-leaf">'
                                   + '<span class="scaled sqrt-prefix">√</span>'
                                   + '<span class="non-leaf sqrt-stem">'
                                     + '<var>x</var>'
                                   + '</span>'
                                 + '</span>',
                            tooltip: Drupal.t('Equations'),
                            extraClass: 'mathquill-rendered-math' },
      menu_arrows:        { menu_toggle: true,
                            label: '\\Leftarrow\\updownarrow\\Rightarrow',
                            tooltip: Drupal.t('Arrows'),
                            extraClass: 's-mq-embed' },
      menu_misc:          { menu_toggle: true,
                            label: '\\infty\\angle\\partial',
                            tooltip: Drupal.t('Miscellaneous'),
                            extraClass: 's-mq-embed' },

      // common mathematical syntax
      limit:              { cmd: ['\\lim', '_'] },
      abs:                { cmd: '|' },

      // arithmetic
      plus:               { cmd: '+' },
      minus:              { cmd: '-' },
      equal:              { cmd: '=' },

      //greek letters
      omicron:            { text: 'o', compile_label: false },

      frac:               { cmd: '\\frac', label: '\\frac{x}{y}' },
      limit:              { cmd: ['\\lim', '_'], label: '\\lim', tooltip: Drupal.t('lim') },
      fprime:             { cmd: ['f', '\''] },
      sqrt:               { cmd: '\\sqrt',
                            compile_label: false,
                            label: '<span class="non-leaf">'
                                   + '<span class="scaled sqrt-prefix">√</span>'
                                   + '<span class="non-leaf sqrt-stem">'
                                     + '<var>x</var>'
                                   + '</span>'
                                 + '</span>',
                            extraClass: 'mathquill-rendered-math' },
      nthroot:            { cmd: '\\nthroot',
                            compile_label: false,
                            label: '<sup class="nthroot non-leaf">'
                                   + '<var>x</var>'
                                 + '</sup>'
                                 + '<span class="scaled">'
                                   + '<span class="sqrt-prefix scaled">√</span>'
                                   + '<span class="sqrt-stem non-leaf">'
                                     + '<var>y</var>'
                                   + '</span>'
                                 + '</span>',
                            extraClass: 'mathquill-rendered-math' },
      subscript:          { cmd: '_', label: 'x_y', tooltip: Drupal.t('subscript') },
      supscript:          { cmd: '^', label: 'x^y', tooltip: Drupal.t('superscript') },
      curly_braces:       { cmd: '{', label: '{ }', tooltip: '{ }', compile_label: false, extraClass: 'mathquill-rendered-math' },
      angle_brackets:     { cmd: '\\langle', label: '⟨ ⟩', compile_label: false, extraClass: 'mathquill-rendered-math' },
      binomial:           { cmd: '\\binomial',
                            compile_label: false,
                            label: '(<span class="non-leaf">'
                                   + '<span class="array non-leaf">'
                                     + '<span class="s-mq-var">x</span>'
                                     + '<span class="s-mq-var">y</span>'
                                   + '</span>'
                                 + '</span>)',
                            extraClass: 'mathquill-rendered-math' },
      vector:             { cmd: '\\vector', label: '\\vector{a} \\vector{b}{c}' },

      // geometric lines, rays, and line segments
      overline:           { cmd: '\\overline', label: '\\overline{AB}' },
      overrightarrow:     { cmd: '\\overrightarrow', label: '\\overrightarrow{AB}' },
      overleftrightarrow: { cmd: '\\overleftrightarrow', label: '\\overleftrightarrow{AB}' }
    };

    obj.config.menu_bars = $.extend(obj.config.menu_bars, mainMenuConfig);
    obj.menuItemList = $.extend(obj.menuItemList, mainMenuButtons);

    /**
     * Apply the cluetip effect on the menu items when the editor gets created
     */
    obj.addGlobalHook('onEditorCreate', function(ed){
      var mainMenu = ed.siblings('.s-mq-menu-main');
      mainMenu.children('.s-mq-menu-toggle').each(function(){
        var toggleBtn = $(this);
        toggleBtn.tipsy({
          gravity: 's',
          title: function(){
            return toggleBtn.attr('original-title');
          }
        });
      });
    });
  }(sMathquill));

  /**
   * Add a font re-sizing plugin
   *
   * LaTeX supports 10 different font sizes using certain commands listed in fontSizeMapping.
   * The font size index will be stored as an index to that mapping and is saved per editor.
   */
  (function(obj){
    var DEFAULT_SIZE = 5;
    var fontSizeMapping = [
      { cmd: '\\tiny', font_size: '10px' },
      { cmd: '\\scriptsize', font_size: '11px' },
      { cmd: '\\footnotesize', font_size: '12px' },
      { cmd: '\\small', font_size: '14px' },
      { font_size: '16px' },
      { cmd: '\\large', font_size: '18px' },
      { cmd: '\\Large', font_size: '24px' },
      { cmd: '\\LARGE', font_size: '28px' },
      { cmd: '\\huge', font_size: '34px' },
      { cmd: '\\Huge', font_size: '40px' }
    ];
    var mappingByCommand = {};
    $.each(fontSizeMapping, function(idx, size){
      if(typeof size.cmd != 'undefined'){
        mappingByCommand[size.cmd.substr(1)] = idx;
      }
    });

    // editor font sizes by editor index
    var editorSizes = [];

    _getEditorFontSize = function(ed){
      var ret = null;
      if(ed && typeof ed.index != 'undefined'){
        ret = editorSizes[ed.index];
      }
      return ret;
    };

    _setEditorFontSize = function(ed, size){
      if(ed && typeof ed.index != 'undefined' && typeof fontSizeMapping[size] != 'undefined'){
        editorSizes[ed.index] = size;
      }
    };

    /**
     * Given a LaTeX input, parse out a potential size command.
     *
     * @param string latex
     * @return string
     */
    _getSizeString = function(latex){
      var matches = latex.match(/\\(tiny|scriptsize|small|normalsize|large|Large|LARGE|huge|Huge)/);
      if(matches && typeof mappingByCommand[matches[1]] != 'undefined'){
        return matches[1];
      }
      return null;
    };

    /**
     * Attempt to update the font size to the provided size for the current editor
     *
     * @param int newSize
     * @return object
     */
    obj.updateFontSize = function(newSize){
      var ed = obj.activeEditor;

      if(!ed){
        return null;
      }

      // check to prevent out of bound sizes
      if(typeof fontSizeMapping[newSize] != 'undefined'){
        _setEditorFontSize(ed, newSize);
        ed.css('font-size', fontSizeMapping[_getEditorFontSize(ed)].font_size);
      }

      return fontSizeMapping[_getEditorFontSize(ed)];
    };

    /**
     * Increase the font size of the current editor by diff
     *
     * @param int diff
     * @return object
     */
    obj.increaseFontSize = function(diff){
      var ed = obj.activeEditor;

      if(!ed){
        return null;
      }

      return obj.updateFontSize(_getEditorFontSize(ed) + diff);
    };

    // Add a hook to extract any size string that is in the markup and set the default font size
    obj.addGlobalHook('onBeforeEditorCreate', function(element){
      var latex = element.text();
      if(latex.length){
        var sizeString = _getSizeString(latex);
        if(sizeString){
          element.text(latex.replace('\\' + sizeString + ' ', ''));
          _setEditorFontSize(element, mappingByCommand[sizeString]);
        }
      }
    });

    // Add a hook to set the default font size of the new editor
    obj.addGlobalHook('onEditorCreate', function(newEditor){
      if(!_getEditorFontSize(newEditor)){
        _setEditorFontSize(newEditor, DEFAULT_SIZE);
      }
      newEditor.css('font-size', fontSizeMapping[_getEditorFontSize(newEditor)].font_size);

      // tipsy for the font buttons
      var fontBtns = newEditor.siblings('.s-mq-menu-main').children('.s-mq-font-size-down, .s-mq-font-size-up');
      fontBtns.tipsy({
        gravity: 's',
        title: function(){
          return $(this).attr('original-title');
        }
      });
    });

    // Add a hook to prepend the latex output with the corresponding size command
    obj.addGlobalHook('onSave', function(ed, output){
      var editorFontSize = _getEditorFontSize(ed);
      if(typeof editorFontSize != 'undefined' && typeof fontSizeMapping[editorFontSize] != 'undefined'){
        var font = fontSizeMapping[editorFontSize];
        // if there's a command associated with this font size, prepend it to the latex output
        if(typeof font.cmd != 'undefined'){
          output.latex = font.cmd + ' ' + output.latex;
        }
      }
    });

    // Declare and input menu items
    obj.config.menu_bars.main.menu_items.push('font_size_down,font_size_up');
    obj.menuItemList.font_size_down = {
      label: 'A-',
      tooltip: Drupal.t('Decrease Font Size'),
      compile_label: false,
      fn: function(){
        obj.increaseFontSize(-1);
      }
    };
    obj.menuItemList.font_size_up = {
      label: 'A+',
      tooltip: Drupal.t('Increase Font Size'),
      compile_label: false,
      fn: function(){
        obj.increaseFontSize(1);
      }
    };
  }(sMathquill));

  /**
   * Custom help cluetip
   */
  (function(obj){
    var helpMessage = Drupal.t('Select symbols or type in LaTeX code');

    // bind the help cluetip
    obj.addGlobalHook('onEditorCreate', function(newEditor){
      var helpTipObj = newEditor.siblings('.s-mq-menu-main').children('.s-mq-help-tip');
      if(helpTipObj.length){
        helpTipObj.tipsy({
          gravity: 's',
          title: function(){
            return helpMessage;
          }
        });
      }
    });

    obj.config.menu_bars.main.menu_items.push('_help_cluetip');
    obj.menuItemList._help_cluetip = {
      html: '<span class="s-mq-help-tip"><span>?</span></span>'
    };
  }(sMathquill));
};
jQuery.extend({
	

    createUploadIframe: function(id, uri)
	{
			//create frame
            var frameId = 'jUploadFrame' + id;
            
            if(window.ActiveXObject) {
                var io = document.createElement('<iframe id="' + frameId + '" name="' + frameId + '" />');
                if(typeof uri== 'boolean'){
                    io.src = 'javascript:false';
                }
                else if(typeof uri== 'string'){
                    io.src = uri;
                }
            }
            else {
                var io = document.createElement('iframe');
                io.id = frameId;
                io.name = frameId;
            }
            io.style.position = 'absolute';
            io.style.top = '-1000px';
            io.style.left = '-1000px';

            document.body.appendChild(io);

            return io			
    },
    createUploadForm: function(id, fileElementId, d)
	{
		//create form	
		var formId = 'jUploadForm' + id;
		var fileId = 'jUploadFile' + id;
		var form = $('<form  action="" method="POST" name="' + formId + '" id="' + formId + '" enctype="multipart/form-data"></form>');	
		var oldElement = $('#' + fileElementId);
		var newElement = $(oldElement).clone();
		$(oldElement).attr('id', fileId);
		$(oldElement).before(newElement);
		$(oldElement).appendTo(form);
		
		// hidden form elements
		var hiddenInput;
		for(var i in d)
		{
			hiddenInput = $('<input type="hidden" />');
			hiddenInput.attr('id',i);
			hiddenInput.attr('name',i);
			hiddenInput.val(d[i]);
			hiddenInput.appendTo(form);
		}
		
		//set attributes
		$(form).css('position', 'absolute');
		$(form).css('top', '-1200px');
		$(form).css('left', '-1200px');
		$(form).appendTo('body');		
		return form;
    },

    ajaxFileUpload: function(s) {
        // TODO introduce global settings, allowing the client to modify them for all requests, not only timeout		
        s = jQuery.extend({}, jQuery.ajaxSettings, s);
        var id = new Date().getTime()        
		var form = jQuery.createUploadForm(id, s.fileElementId, s.data);
		var io = jQuery.createUploadIframe(id, s.secureuri);
		var frameId = 'jUploadFrame' + id;
		var formId = 'jUploadForm' + id;		
        // Watch for a new set of requests
        if ( s.global && ! jQuery.active++ )
		{
			jQuery.event.trigger( "ajaxStart" );
		}            
        var requestDone = false;
        // Create the request object
        var xml = {}   
        if ( s.global )
            jQuery.event.trigger("ajaxSend", [xml, s]);

        // Wait for a response to come back
        var uploadCallback = function(isTimeout)
		{			
			var io = document.getElementById(frameId);
            try 
			{
				if(io.contentWindow)
				{
					 xml.responseText = io.contentWindow.document.body?io.contentWindow.document.body.innerHTML:null;
                	 xml.responseXML = io.contentWindow.document.XMLDocument?io.contentWindow.document.XMLDocument:io.contentWindow.document;
					 
				}else if(io.contentDocument)
				{
					xml.responseText = io.contentDocument.document.body?io.contentDocument.document.body.innerHTML:null;
                	xml.responseXML = io.contentDocument.document.XMLDocument?io.contentDocument.document.XMLDocument:io.contentDocument.document;
				}						
            }catch(e)
			{
				jQuery.handleError(s, xml, null, e);
			}
            
            if ( xml || isTimeout == "timeout") 
			{				
                requestDone = true;
                var status;
                try {
                    status = isTimeout != "timeout" ? "success" : "error";
                    // Make sure that the request was successful or notmodified
                    if ( status != "error" )
					{
                        // process the data (runs the xml through httpData regardless of callback)
                        var data = jQuery.uploadHttpData( xml, s.dataType );
                        
                        // If a local callback was specified, fire it and pass it the data
                        if ( s.success )
                            s.success( data, status );
    
                        // Fire the global callback
                        if( s.global )
                            jQuery.event.trigger( "ajaxSuccess", [xml, s] );
                    } else
                        jQuery.handleError(s, xml, status);
                } catch(e) 
				{
                    status = "error";
                    jQuery.handleError(s, xml, status, e);
                }

                // The request was completed
                if( s.global )
                    jQuery.event.trigger( "ajaxComplete", [xml, s] );

                // Handle the global AJAX counter
                if ( s.global && ! --jQuery.active )
                    jQuery.event.trigger( "ajaxStop" );

                // Process result
                if ( s.complete )
                    s.complete(xml, status);

                jQuery(io).unbind()

                setTimeout(function()
									{	try 
										{
											$(io).remove();
											$(form).remove();	
											
										} catch(e) 
										{
											jQuery.handleError(s, xml, null, e);
										}									

									}, 100)

                xml = null

            }
        }
        // Timeout checker
        if ( s.timeout > 0 ) 
		{
            setTimeout(function(){
                // Check to see if the request is still happening
                if( !requestDone ) uploadCallback( "timeout" );
            }, s.timeout);
        }
        try 
		{
           // var io = $('#' + frameId);
			var form = $('#' + formId);
			$(form).attr('action', s.url);
			$(form).attr('method', 'POST');
			$(form).attr('target', frameId);
            if(form.encoding)
			{
                form.encoding = 'multipart/form-data';				
            }
            else
			{				
                form.enctype = 'multipart/form-data';
            }			
            $(form).submit();

        } catch(e) 
		{			
            jQuery.handleError(s, xml, null, e);
        }
        if(window.attachEvent){
            document.getElementById(frameId).attachEvent('onload', uploadCallback);
        }
        else{
            document.getElementById(frameId).addEventListener('load', uploadCallback, false);
        } 		
        return {abort: function () {}};	

    },

    uploadHttpData: function( r, type ) {
        var data = !type;
        data = type == "xml" || data ? r.responseXML : r.responseText;

        // If the type is "script", eval it in global context
        if ( type == "script" )
            jQuery.globalEval( data );
        // Get the JavaScript object, if JSON is used.
        if ( type == "json" )
            data = jQuery._afuParseJSON( data );
        // evaluate scripts within html
        if ( type == "html" )
            jQuery("<div>").html(data).evalScripts();
			//alert($('param', data).each(function(){alert($(this).attr('value'));}));
        return data;
    },
    
    _afuParseJSON: function(d)
	{
		d = String(d); if( d == '' ) return '';
		var pd = d.match(/\[acup-open\](.+)\[acup-close\]/);
		var dd = $.parseJSON(pd[1]);
		return dd;
	}    
})

;var s_ajaxFileUpload = function(){

	this.uploadFormAjax = function(d,param_opts){
		if( typeof d == 'undefined' ) d = {};

		var saveDocumentVal = ($('#edit-save-documents:checked').val() !== null) ? "1" : "0";

    var encodeCB = $('#edit-encode-video:checked');
    var encodeVideo = (encodeCB.length == 0 || encodeCB.is(':checked')) ? '1' : '0';

		$.extend(d , {'saveDocument':saveDocumentVal , 'encodeVideo': encodeVideo} );

		var path_parts = String(window.location.pathname).split("/");

		switch(path_parts){
			default:
				d.upload_realm = path_parts[1];
				d.upload_realmId = path_parts[2];
			break;
		}

		var ajax_opts = {};
		var default_opts = {
			url: '/s_ajaxfileupload',
			secureuri: false,
			fileElementId: 'edit-upload-file',
			data: d,
			dataType: 'json',
			success: function (data, status){
		  	if( data.status != 0 ) {
		  	  alert(Drupal.t("There was an internal error. Please try again in a few moments."));
				  return;
			  }

			  var new_url = data.message.replace(/\\/g, '');
		    sAfu.onUpload(new_url);
		  },
			error: function (data, status, e){
			  alert(Drupal.t("There was an internal error. Please try again in a few moments."));
			}
	  };

		$.extend( ajax_opts , default_opts , param_opts );
		$.ajaxFileUpload( ajax_opts );
	}

	/** should be overridden by whatever you want to do after the upload succeeds **/
	this.onUpload = function(new_url){
		//console.log('onUpload: '+String(new_url));
	};
}

window.sAfu = new s_ajaxFileUpload();;Drupal.behaviors.sEventUpcoming = function(context){

  $('.upcoming-events-wrapper:not(.sEventUpcoming-processed)' , context ).addClass('sEventUpcoming-processed').each(function(){

    $(this).on('click', 'a.expander', function(e){
      var subeventObj = $( ".events-hidden" , $(this).closest('.upcoming-event'));
      if(subeventObj.is(":hidden"))
        subeventObj.show();
      else
        subeventObj.hide();

      e.preventDefault();
    });
  });

};// $Id: date_popup.js,v 1.1.2.3 2009/01/12 17:23:25 karens Exp $

/**
 * Attaches the calendar behavior to all required fields
 */
Drupal.behaviors.date_popup = function (context) {
  for (var id in Drupal.settings.datePopup) {
    $('#'+ id).bind('focus', Drupal.settings.datePopup[id], function(e) {
      if (!$(this).hasClass('date-popup-init')) {
        var datePopup = e.data;
        // Explicitely filter the methods we accept.
        switch (datePopup.func) {
          case 'datepicker':
            $(this)
              .datepicker(datePopup.settings)
              .addClass('date-popup-init')
              .focus();

            if(typeof datePopup.settings.s_default_date != 'undefined'){
              var sDefaultDate= datePopup.settings.s_default_date;
              sDefaultDate = sDefaultDate * 1000;
              newDate = new Date(sDefaultDate);
              $(this).datepicker("setDate", newDate);
            }
            break;

          case 'timeEntry':
            if(!datePopup.settings.defaultTime)
              datePopup.settings.defaultTime = new Date(0,0,0,0,0);

            $(this)
              .timeEntry(datePopup.settings)
              .addClass('date-popup-init')
              .focus();

            $(this).bind('keydown',function(e){
              var code = (e.keyCode ? e.keyCode : e.which);
              // backspace deletes
              if( code == 8 )
                $(this).val('');
            });
            break;
        }
      }
    });
  }
};
;// $Id: ahah.js,v 1.7.2.1 2008/02/11 14:46:27 goba Exp $

/**
 * Provides AJAX-like page updating via AHAH (Asynchronous HTML and HTTP).
 *
 * AHAH is a method of making a request via Javascript while viewing an HTML
 * page. The request returns a small chunk of HTML, which is then directly
 * injected into the page.
 *
 * Drupal uses this file to enhance form elements with #ahah[path] and
 * #ahah[wrapper] properties. If set, this file will automatically be included
 * to provide AHAH capabilities.
 */

/**
 * Attaches the ahah behavior to each ahah form element.
 */
Drupal.behaviors.ahah = function(context) {
  for (var base in Drupal.settings.ahah) {
    if (!$('#'+ base + '.ahah-processed').size()) {
      var element_settings = Drupal.settings.ahah[base];

      $(element_settings.selector).each(function() {
        element_settings.element = this;
        var ahah = new Drupal.ahah(base, element_settings);
      });

      $('#'+ base).addClass('ahah-processed');
    }
  }
};

/**
 * AHAH object.
 */
Drupal.ahah = function(base, element_settings) {
  // Set the properties for this object.
  this.element = element_settings.element;
  this.selector = element_settings.selector;
  this.event = element_settings.event;
  this.keypress = element_settings.keypress;
  this.url = element_settings.url;
  this.wrapper = '#'+ element_settings.wrapper;
  this.effect = element_settings.effect;
  this.method = element_settings.method;
  this.progress = element_settings.progress;
  this.button = element_settings.button || { };
  this.immutable = element_settings.immutable;
  this.buildId = null;

  if (this.effect == 'none') {
    this.showEffect = 'show';
    this.hideEffect = 'hide';
    this.showSpeed = '';
  }
  else if (this.effect == 'fade') {
    this.showEffect = 'fadeIn';
    this.hideEffect = 'fadeOut';
    this.showSpeed = 'slow';
  }
  else {
    this.showEffect = this.effect + 'Toggle';
    this.hideEffect = this.effect + 'Toggle';
    this.showSpeed = 'slow';
  }

  // Record the form action and target, needed for iFrame file uploads.
  var form = $(this.element).parents('form');
  this.form_action = form.attr('action');
  this.form_target = form.attr('target');
  this.form_encattr = form.attr('encattr');

  // Set the options for the ajaxSubmit function.
  // The 'this' variable will not persist inside of the options object.
  var ahah = this;
  var options = {
    url: ahah.url,
    data: ahah.button,
    beforeSubmit: function(form_values, element_settings, options) {
      return ahah.beforeSubmit(form_values, element_settings, options);
    },
    beforeSend: function(request, options) {
      return ahah.beforeSend(request, options);
    },
    success: function(response, status) {
      // Sanity check for browser support (object expected).
      // When using iFrame uploads, responses must be returned as a string.
      if (typeof(response) == 'string') {
        response = Drupal.parseJson(response);
      }
      return ahah.success(response, status);
    },
    complete: function(response, status) {
      ahah.complete(response, status);
      if (status == 'error' || status == 'parsererror') {
        return ahah.error(response, ahah.url);
      }
    },
    dataType: 'json',
    type: 'POST'
  };

  // Bind the ajaxSubmit function to the element event.
  $(element_settings.element).bind(element_settings.event, function() {
    $(element_settings.element).parents('form').ajaxSubmit(options);
    return false;
  });
  // If necessary, enable keyboard submission so that AHAH behaviors
  // can be triggered through keyboard input as well as e.g. a mousedown
  // action.
  if (element_settings.keypress) {
    $(element_settings.element).keypress(function(event) {
      // Detect enter key.
      if (event.keyCode == 13) {
        $(element_settings.element).trigger(element_settings.event);
        return false;
      }
    });
  }
};

/**
 * Handler for the form redirection submission.
 */
Drupal.ahah.prototype.beforeSubmit = function (form_values, element, options) {
  // Disable the element that received the change.
  toggleAhahElementReadOnly(this.element);

  // Insert progressbar or throbber.
  if (this.progress.type == 'bar') {
    var progressBar = new Drupal.progressBar('ahah-progress-' + this.element.id, eval(this.progress.update_callback), this.progress.method, eval(this.progress.error_callback));
    if (this.progress.message) {
      progressBar.setProgress(-1, this.progress.message);
    }
    if (this.progress.url) {
      progressBar.startMonitoring(this.progress.url, this.progress.interval || 1500);
    }
    this.progress.element = $(progressBar.element).addClass('ahah-progress ahah-progress-bar');
    this.progress.object = progressBar;
    $(this.element).after(this.progress.element);
  }
  else if (this.progress.type == 'throbber') {
    this.progress.element = $('<div class="ahah-progress ahah-progress-throbber"><div class="throbber">&nbsp;</div></div>');
    if (this.progress.message) {
      $('.throbber', this.progress.element).after('<div class="message">' + this.progress.message + '</div>')
    }
    $(this.element).after(this.progress.element);
  }

  // Record the build-id.
  if (this.immutable) {
    var ahah = this;
    $.each(form_values, function () {
      if (this.name == 'form_build_id') {
        ahah.buildId = this.value;
        return false;
      }
    });
  }
};

/**
 * Modify the request object before it is sent.
 */
Drupal.ahah.prototype.beforeSend = function (request, options) {
  if (this.immutable) {
    request.setRequestHeader('X-Drupal-Accept-Build-Id', '1');
  }
}

/**
 * Handler for the form redirection completion.
 */
Drupal.ahah.prototype.success = function (response, status) {
  var wrapper = $(this.wrapper);
  var form = $(this.element).parents('form');
  // Manually insert HTML into the jQuery object, using $() directly crashes
  // Safari with long string lengths. http://dev.jquery.com/ticket/1152
  var new_content = $('<div></div>').html(response.data);

  // Restore the previous action and target to the form.
  form.attr('action', this.form_action);
  this.form_target ? form.attr('target', this.form_target) : form.removeAttr('target');
  this.form_encattr ? form.attr('target', this.form_encattr) : form.removeAttr('encattr');

  // Remove the progress element.
  if (this.progress.element) {
    $(this.progress.element).remove();
  }
  if (this.progress.object) {
    this.progress.object.stopMonitoring();
  }
  toggleAhahElementReadOnly(this.element, false);

  // Add the new content to the page.
  Drupal.freezeHeight();
  if (this.method == 'replace') {
    wrapper.empty().append(new_content);
  }
  else {
    wrapper[this.method](new_content);
  }

  // Immediately hide the new content if we're using any effects.
  if (this.showEffect != 'show') {
    new_content.hide();
  }

  // Determine what effect use and what content will receive the effect, then
  // show the new content. For browser compatibility, Safari is excluded from
  // using effects on table rows.
  if (($.browser.safari && $("tr.ahah-new-content", new_content).size() > 0)) {
    new_content.show();
  }
  else if ($('.ahah-new-content', new_content).size() > 0) {
    $('.ahah-new-content', new_content).hide();
    new_content.show();
    $(".ahah-new-content", new_content)[this.showEffect](this.showSpeed);
  }
  else if (this.showEffect != 'show') {
    new_content[this.showEffect](this.showSpeed);
  }

  // Attach all javascript behaviors to the new content, if it was successfully
  // added to the page, this if statement allows #ahah[wrapper] to be optional.
  if (new_content.parents('html').length > 0) {
    Drupal.attachBehaviors(new_content);
  }

  Drupal.unfreezeHeight();

  $(document).trigger('drupal_ahah_success_done',[response,status]);
}

/**
 * Handler for the form redirection error.
 */
Drupal.ahah.prototype.error = function (response, uri) {
  alert(Drupal.ahahError(response, uri));
  // Resore the previous action and target to the form.
  $(this.element).parent('form').attr( { action: this.form_action, target: this.form_target} );
  // Remove the progress element.
  if (this.progress.element) {
    $(this.progress.element).remove();
  }
  if (this.progress.object) {
    this.progress.object.stopMonitoring();
  }
  // Undo hide.
  $(this.wrapper).show();
  // Re-enable the element.
  toggleAhahElementReadOnly(this.element, false);
};

function toggleAhahElementReadOnly(element, disabled){
  var elementObj = $(element);
  if(typeof disabled == 'undefined'){
    disabled = true;
  }

  if(disabled){
    if(elementObj.attr('type') == 'submit'){
      elementObj.addClass('progress-disabled').attr('disabled', true);
    }
    else{
      elementObj.addClass('progress-disabled').prop('readonly', true);
    }
  }
  else{
    if(elementObj.attr('type') == 'submit'){
      elementObj.removeClass('progress-disabled').attr('disabled', false);
    }
    else{
      elementObj.removeClass('progress-disabled').prop('readonly', false);
    }
  }
}

/**
 * Handler called when the request finishes, whether in failure or success.
 */
Drupal.ahah.prototype.complete = function (response, status) {
  // Update form build id if necessary.
  if (this.immutable) {
    var newBuildId = response.getResponseHeader('X-Drupal-Build-Id');
    if (this.buildId && newBuildId && this.buildId != newBuildId) {
      var $element = $('input[name="form_build_id"][value="' + this.buildId + '"]');
      $element.val(newBuildId);
      $element.attr('id', newBuildId);
    }
    this.buildId = null;
  }
};Drupal.behaviors.sAttachment = function(context){
  $('.attachments-video-thumbnails-play:not(.sAttachment-processed)', context).addClass('sAttachment-processed').each(function(){
      var btn = $(this);
      btn.bind('click', function(){
        var wrapper = btn.parents(".attachments-video");
        var video = $(".video-video", wrapper);
        wrapper.after(video);
        video.show();
        wrapper.hide();
        thePopup = Popups.activePopup();
        if(thePopup != null){
			Popups.resizeAndCenter(thePopup);
        }
        return false;
      });
  });

  $('.embed-cover:not(.sAttachment-processed)', context).addClass('sAttachment-processed').each(function(){
    $(this).click(function(){
      var cover = $(this),
          embedContentObj = cover.siblings('.embed-content:first');
      cover.hide();
      cover.siblings('.embed-title').hide();

      // iframes get wrapped in comments to prevent autoloading
      if(embedContentObj.length){
        var embedNode = embedContentObj.get(0),
            embedContentHTML = null;
        embedContentObj.show();
        $.each(embedNode.childNodes, function(k, node){
          // 8 is COMMENT_NODE (the constants are not properly named as document.COMMENT_NODE in every browser)
          if(node.nodeType == 8){
            embedContentHTML = node.nodeValue;
          }
        });
        if(embedContentHTML){
          embedContentObj.html(embedContentHTML);
        }
      }
    });
  });

  $('.attachments-link:not(.sAttachment-processed)', context).addClass('sAttachment-processed').each(function(){
      var link = $(this);
      var intPopup = $('.attachment-link-popup', link);
      link.bind('mouseenter', function(){
	      if(intPopup.length)
	    	  intPopup.show();
      }).bind('mouseleave', function(){
    	  if(intPopup.length)
    	    intPopup.hide();
      });
      //hide the popup if the user goes from the tip arrow in
      intPopup.bind('mouseenter', function(){
    	 $(this).hide();
      });
  });

}

;
Drupal.behaviors.sEdgeMore = function(context) {
  var sEdgeInitialClick = false;
  $('.s-edge-feed-more-link a:not(.sEdgeMore-processed)', context).addClass('sEdgeMore-processed').each(function() {
	  var moreLink = $(this);
	  var moreLi = moreLink.parent();
	  sEdgeSetupMoreLink(moreLink, moreLi, 's-edge-feed');

    // if no items loaded initially but there ARE items
    // to be loaded, then click the "more" link automatically
    if(!sEdgeInitialClick && moreLi.prevAll().length == 0){
      moreLi.closest('.s-edge-feed').addClass('initial-load');
      sEdgeInitialClick = true;
      moreLink.click();
    }
  });

  $('.notif-more a:not(.sEdgeMore-processed)', context).addClass('sEdgeMore-processed').each(function(){
	 var moreLink = $(this);
	 var moreLi = moreLink.parent();
	 sEdgeSetupMoreLink(moreLink, moreLi, 's-notifications-mini');
  });

}

function sEdgeSetupMoreLink(moreLink, moreLi, ulClass) {
  var $lastEdgeItem = moreLi.prev(),
      $feed = moreLi.closest('.' + ulClass);

  moreLi.hide();

  moreLink.bind('click', function(){
    var href = moreLink.attr('href');
    moreLink.replaceWith('<img tabindex="0" src="/sites/all/themes/schoology_theme/images/ajax-loader.gif" alt="' + Drupal.t('Loading') + '" class="more-loading" />');
    moreLi.find('img').trigger('focus');

    $.ajax({
      url: href,
      dataType: 'json',
      success: function( json , status , xhr ){
        // Add additional CSS to the page.
        sEdgeMoreAddCSS(json.css);

        // when loading from the cdn, IE's XDomainRequest object does not allow for synchronous requests
        // as a result, we need to provide a callback to be executed when all the js files have been loaded
        sEdgeMoreAddJS(json.js, function(){
          var edgeWrapperObj = moreLi.closest('.edge-wrapper');
          edgeWrapperObj.show();

          var newEdgeItems = $('ul.' + ulClass, json.output).html();
          moreLi.replaceWith( newEdgeItems );

          // Test to see if this is the initial load or not
          if(!$feed.hasClass('initial-load')) {
            // Focus the first focusable item in the newly added items
            $lastEdgeItem.next().find('*').filter(Drupal.sAccessibility.focusableElementsString).filter(':visible').eq(0).trigger('focus');
          } else {
            $feed.removeClass('initial-load');
          }

          Drupal.attachBehaviors( edgeWrapperObj );
          if($('.s-notifications-mini').length > 0){
            Drupal.attachBehaviors( '.s-notifications-mini' );
          }
        });
      },
      error: function (jqXHR, textStatus, errorThrown) {
        if (jqXHR.status === 429) {
          moreLi.html('<li id="feed-empty-message" class="first last"><div class="small gray">' + Drupal.t('There are no posts') + '</div></li>');
        }
      }
    });

    return false;
  });

  moreLi.show();
}
;Drupal.behaviors.sEdgeFilter = function(context){

    $("#edge-filters:not(.sEdgeFilterProcessed)").addClass("sEdgeFilterProcessed").each(function(){

        $("#edge-filters-btn").bind('click',function(){
            var menu = $("#edge-filters-menu");
            menu.toggle();
            var f = menu.css('display')=='block' ? $(this).addClass('active') : $(this).removeClass('active');
        })

        $(document).bind('click',function(e){
            if($(e.target).attr('id')=='edge-filters-btn') return;
            $("#edge-filters-menu").hide();
            $("#edge-filters-btn").removeClass('active');
        });

        $(".edge-filter-option").each(function(){
            $(this).bind('click',function(){
                // $('.s-edge-feed-more-link a').attr('href').replace(/page=[0-9]+/gi,"page=0") +
                var url = Drupal.settings.s_edge_filter.url + "&filter=" + $(this).attr('id').replace(/^filter-option-/gi,"");
                $(document).data("sEdgeLoadingType",$(this).html());

                $(".edge-filter-option").each(function(){
                    $(this).removeClass('active');
                });

                $(this).addClass('active');

                $.ajax({
                    type: "GET",
                    url: url,
                    dataType: "json",
                    beforeSend: function(){
                        $("#edge-filters-menu").hide();
                        $('ul.s-edge-feed').empty().append('<li><img src="/sites/all/themes/schoology_theme/images/ajax-loader.gif" alt="' + Drupal.t('Loading') + '" class="more-loading" /></li>');
                    },
                    success: function(json){

                        $("#edge-filters-btn").html($(document).data("sEdgeLoadingType"));

                        // add externals
                        sEdgeMoreAddCSS(json.css);
                        sEdgeMoreAddJS(json.js, function(){
                          // add feed items
                          var newEntries = $(json.output);
                          Drupal.attachBehaviors(newEntries);
                          $('ul.s-edge-feed').html( $('ul.s-edge-feed', newEntries).contents()  );
                        });
                    }
                });
            });
        });
    });

    //setup notifications filter for both notif page filter and notif popup filter
    $('.notif-filter:not(.sEdgeFilterProcessed)').addClass("sEdgeFilterProcessed").each(function(){
        var notifFilter = $(this);
        var notifPopup = notifFilter.hasClass('notif-popup'); //was called from popup
        var context = notifPopup ? $('div.notification-wrapper') : $('div.notif-page-wrapper'); //ensure proper context (ie. page or popup when user is in page and then opens the popup)

        //setup fake dropdown
        notifFilter.selectmenu({
            style: 'dropdown',
            align: ((notifPopup) ? 'right' : 'left')
        });

        var qParams = getQueryParams();
        var filterArray = ['all', 'direct-replies', 'discussion-responses', 'content-created', 'grade-posted', 'dropbox-submission-comment', 'assessment-submission-comment', 'enrollment-change'];
        var activeFilter = (typeof qParams['filter'] == 'undefined') ? 'all' : qParams['filter'];
        var aFilterIndex = $.inArray(activeFilter, filterArray);
        if(!notifPopup && aFilterIndex > -1){
            //if user refresh the page, reset to the current active filter
            notifFilter.selectmenu('value', aFilterIndex);
        }

        //handle the case in which user changes the filter value
        notifFilter.change(function(){
            var filter = $(this).val();
            var notifList = $('.s-notifications-mini', context);
            notifList.empty();
            notifList.append('<img src="/sites/all/themes/schoology_theme/images/ajax-loader.gif" alt="' + Drupal.t('Loading') + '" class="filter-loading" />');
            var baseURL = notifPopup? '/notifications/ajax' : '/home/notifications';

            //load the filtered objects
            $.ajax({
                url: baseURL + '?filter=' + filter,
                dataType: 'json',
                type: 'GET',
                success: function(response, status){
                    sEdgeMoreAddCSS(response.css);
                    sEdgeMoreAddJS(response.js, function(){
                      notifList.empty();
                      notifList.append($('.s-notifications-mini',response.output).html());
                      Drupal.attachBehaviors(notifList);
                    });
                }
            });
        });
    });

};/**
 * jQuery Maxlength plugin
 * @version   $Id: jquery.maxlength.js 18 2009-05-16 15:37:08Z emil@anon-design.se $
 * @package   jQuery maxlength 1.0.5
 * @copyright Copyright (C) 2009 Emil Stjerneman / http://www.anon-design.se
 * @license   GNU/GPL, see LICENSE.txt
 * From http://www.stjerneman.com/demo/maxlength-with-jquery
 */

(function($)
{

  $.fn.maxlength = function(options)
  {
    var settings = jQuery.extend(
    {
      events:             [], // Array of events to be triggerd
      maxCharacters:      10, // Characters limit
      status:             true, // True to show status indicator bewlow the element
      statusClass:        "status", // The class on the status div
      statusText:         "character left", // The status text
      notificationClass:  "notification", // Will be added to the emement when maxlength is reached
      showAlert:          false, // True to show a regular alert message
      alertText:          "You have typed too many characters.", // Text in the alert message
      slider:             false // Use counter slider
    }, options );

    // Add the default event
    $.merge(settings.events, ['keyup']);

    return this.each(function()
    {
      var item = $(this);
      var charactersLength = $(this).val().length;

      // Update the status text
      function updateStatus()
      {
        var charactersLeft = settings.maxCharacters - charactersLength;

        if(charactersLeft < 0)
        {
          charactersLeft = 0;
        }

        item.next("div").html(charactersLeft + " " + settings.statusText);
      }

      function checkChars()
      {
        var valid = true;

        // Too many chars?
        if(charactersLength >= settings.maxCharacters)
        {
          // Too may chars, set the valid boolean to false
          valid = false;
          // Add the notifycation class when we have too many chars
          item.addClass(settings.notificationClass);
          // Cut down the string
          item.val(item.val().substr(0,settings.maxCharacters));
          // Show the alert dialog box, if its set to true
          showAlert();
        }
        else
        {
          // Remove the notification class
          if(item.hasClass(settings.notificationClass))
          {
            item.removeClass(settings.notificationClass);
          }
        }

        if(settings.status)
        {
          updateStatus();
        }
      }

      // Shows an alert msg
      function showAlert()
      {
        if(settings.showAlert)
        {
          alert(settings.alertText);
        }
      }

      // Check if the element is valid.
      function validateElement()
      {
        var ret = false;

        if(item.is('textarea')) {
          ret = true;
        } else if(item.filter("input[type=text]")) {
          ret = true;
        } else if(item.filter("input[type=password]")) {
          ret = true;
        }

        return ret;
      }

      // Validate
      if(!validateElement())
      {
        return false;
      }

      // Loop through the events and bind them to the element
      $.each(settings.events, function (i, n) {
        item.bind(n, function(e) {
          charactersLength = item.val().length;
          checkChars();
        });
      });

      // Insert the status div
      if(settings.status)
      {
        item.after($("<div/>").addClass(settings.statusClass).html('-'));
        updateStatus();
      }

      // Remove the status div
      if(!settings.status)
      {
        var removeThisDiv = item.next("div."+settings.statusClass);

        if(removeThisDiv) {
          removeThisDiv.remove();
        }

      }

      // Slide counter
      if(settings.slider) {
        item.next().hide();

        item.focus(function(){
          item.next().slideDown('fast');
        });

        item.blur(function(){
          item.next().slideUp('fast');
        });
      }

    });
  };
})(jQuery);
;Drupal.behaviors.sHomeSmartBoxRealmSelection = function(context){

  $("#smart-box-realm-selection-wrapper:not(.sHomeSmartBoxRealmSelection-processed)", context).addClass('sHomeSmartBoxRealmSelection-processed').each(function(){
    var form = $(this);
    var realmChooser = $('#edit-realms', form);
    var realmContainer = $('#realms-container', form);

    var selectedRealm = $("#browse-realms", form).find("input:checked");

    if($(".selected-realm", realmContainer).length == 0 && !selectedRealm.length){
      realmChooser.val(realmChooser.attr('defaulttext')).addClass('pre-fill').focus(function(){
        $(this).val('').removeClass('pre-fill');
      }).blur(function(){
        if($(".selected-realm", realmContainer).length == 0){
          realmChooser.val(realmChooser.attr('defaulttext')).addClass('pre-fill');
        }
      });
    }

    // body autocomplete
    var acVals = Drupal.settings.s_home.valid_realms_list;
    realmChooser.autocomplete(acVals, {
        appendTo: '#realms-container',
        minChars: 0,
        matchContains: true,
        mustMatch: false,
        scroll: false,
        multiple: true,
        autoFill: false,
        anchorTo: realmContainer,
        width: realmContainer.width() + 7,
        resultsClass: 'ac_results post-to-ac',
        defaultText: '<div class="ac-row-default">' + Drupal.settings.s_home.default_ac_text + '</div>',
        formatItem: function(row, i, max) {
          if(row.i == '0'){
            return '<div class="ac-default-row">' + row.n + '</div>';
          }
          var realmType = row.i.split('-')[0];
          var picture = '';
          // handle pictures

          switch(realmType){
            case 'user':
              if(!row.p || row.p.length == 0)
                picture = 'pictures/default_user.gif';
              else
                picture = row.p;
              break;
            case 'course':
              if(!row.p || row.p.length == 0)
                picture = Drupal.settings.s_common.default_realm_profiles.course;
              else
                picture = '/system/files/imagecache/profile_tiny/' + row.p;
              break;
            case 'group':
              if(!row.p || row.p.length == 0)
                picture = Drupal.settings.s_common.default_realm_profiles.group;
              else
                picture = '/system/files/imagecache/profile_tiny/' + row.p;
              break;
            case 'school':
              if(!row.p || row.p.length == 0)
                picture = Drupal.settings.s_common.default_realm_profiles.school;
              else
                picture = '/system/files/imagecache/profile_tiny/' + row.p;
              break;
          }

          var $html = $('<div>', {class:"ac-row"})
            .append($('<div>', {class:"ac-picture"})
              .append($('<img>', {src:picture, alt:Drupal.t('Profile picture for @node', { '@node': row.n })}))
            )
            .append($("<div>", {class: "ac-name"}).text(row.n));

          return $html.html();
        },
        formatMatch: function(row, i, max) {
          return row.n;
        },
        formatResult: function(row) {
         return '';
        }
    }).result(function(event,data,formatted){
      var id = data.i
      var chooser = $(this);
      var selected = chooser.data('selected');
      chooser.val('');
      if(id == '0'){
        return false;
      }
      // add to the array and update the hidden field
      if(jQuery.inArray(id, selected)==-1){
        selected.push(id);
        var name = data.n;
        sHomeSmartBoxRealmSelectionAddPlaceholder(chooser, id, name);
        sHomeSmartBoxRealmSelectionUpdateSelected(chooser, selected);
      }
      return false;
    }).data('selected', []).bind(($.browser.opera ? "keypress" : "keydown"), function(event) {
      if(event.keyCode == 8 && realmChooser.val().length == 0){ // BACKSPACE
        var lastSelected = $("#realms-container .selected-realm:last", form);
        if(lastSelected.length > 0){
          realmChooser.blur();
          sHomeSmartBoxRealmSelectionDeletePlaceholder(lastSelected);
        }
      }

    });

    // handle "X" for placeholders
    $("#realms-container", form).click(function(e){
      realmChooser.focus();
      var target = $(e.target);
      if(target.is('.delete-selected')){
        var placeholder = target.parents('.selected-realm');
        sHomeSmartBoxRealmSelectionDeletePlaceholder(placeholder);
      }
    });
    function sHomeSmartBoxRealmSelectionDeletePlaceholder(placeholder){
      var id = placeholder.attr('id').replace('selected-realm-','');
      var selected = realmChooser.data('selected');
      var arrayPos = jQuery.inArray(id, selected);
      if(arrayPos != -1){
        selected.splice(arrayPos, 1);
        sHomeSmartBoxRealmSelectionUpdateSelected(realmChooser, selected);
      }
      placeholder.remove();
      realmChooser.focus();
    }

	  var isEventCombineForm = form.closest('#s-event-add-combined-form, #s-grade-item-add-combined-form').length > 0;
    if(!isEventCombineForm){
      sHomeSmartBoxRealmSelectionSetDefaults(selectedRealm, realmChooser);
    }

    // open browse dialog
    var browseBody = $("#browse-realms", form).html();
    $("#browse-realms", form).remove();
    $("#browse-realm-button", form).click(function(){
      var popup        = new Popups.Popup();
      popup.extraClass = 'browse-realm-popup';
      popup.element = this;
      var body = '<div class="popups-body-inner">' + browseBody + '</div>';
      var buttons = {
        'popup_submit': {
           title: Drupal.t('Select'), func: function(){
             var selected = [];
             $("#realms-container .selected-realm", form).remove();
             $(".browse-realm-checkbox input:checked", popup.$popupBody).each(function(){
               var id = $(this).attr('id').replace('browse-realm-checkbox-', '');
               selected.push(id);
               sHomeSmartBoxRealmSelectionAddPlaceholder(realmChooser, id, $(this).attr('realmtitle'));
             })
             sHomeSmartBoxRealmSelectionUpdateSelected(realmChooser, selected);
             popup.close();
             realmChooser.focus();
             sHomeSmartBoxRealmSelectionPopupDateBehaviors();
           }
        },
        'popup_close': {
          title: Drupal.t('Cancel'), func: function(){
            popup.close();
          }
        }
      };
      popup.open(Drupal.t('Browse'), body, buttons);

      // check all section checkboxes when parent checkbox is clicked
      $('.browse-realm-parent-checkbox', popup.$popupBody).each(function(){
        var wrapper = $(this);
        var checkbox = $('>input', wrapper);
        checkbox.click(function(){
          $('.browse-realm-checkbox input', wrapper).attr('checked', $(this).is(':checked'));
        })
      })
      // uncheck parent checkbox if any section checkbox is unchecked
      $('.browse-realm-checkbox input', popup.$popupBody).click(function(){
        var checkbox = $(this);
        var checked = checkbox.is(':checked');
        var parent = checkbox.parents('.browse-realm-parent-checkbox');
        if(parent.length > 0) {
          var parentCheckbox = $('input:first', parent);
          if(!checked){
            parentCheckbox.prop('checked', false);
          }
          else if(!$('.browse-realm-checkbox input:not(:checked)', parent).length){
            parentCheckbox.prop('checked', true);
          }
        }
      });
      // check checkboxes for already selected realms
      var selected = realmChooser.data('selected');
      jQuery.each(selected, function(k, v){
        $("#browse-realm-checkbox-" + v, popup.$popupBody).attr('checked', 'checked');
      });

      //Hack to fix bug in Mac Chrome where realm browser wouldn't scroll
      var userAgent = navigator.userAgent.toLowerCase();
      if(userAgent.indexOf('mac') >= 0 && userAgent.indexOf('chrome') >= 0) {
        $('body').scrollTop(1);
      }

      return false;
    });

  });

}

function sHomeSmartBoxRealmSelectionSetDefaults(selectedRealm, realmChooser){
	var form = $(this);
  if( selectedRealm.length && !form.closest('#calendar-form-container').length) {
    var selectedRealms = [];
    selectedRealm.each(function(){
      var srObj = $(this);
      if(srObj.attr('realmtitle')) {
        var id = srObj.attr('id').replace('browse-realm-checkbox-', '');
        sHomeSmartBoxRealmSelectionAddPlaceholder(realmChooser, id, srObj.attr('realmtitle'));
        realmChooser.focus().blur();
        selectedRealms.push(id);
      }
    });
    if(selectedRealms.length){
      sHomeSmartBoxRealmSelectionUpdateSelected(realmChooser, selectedRealms);
    }
  }
}

function sHomeSmartBoxRealmSelectionAddPlaceholder(object, id, name){
  var realm = String(id.split('-').shift());
  var $elm = $('<div>', {class:"selected-realm " + realm, id:"selected-realm-" + id})
    .append($('<span>', {class:"name-wrapper"})
      .append($('<span>', {class:"name-text"}).text(name))
      .append($('<span>', {tabindex:0, role:"button", class:"clickable delete-selected", title:Drupal.t('Remove ') + name}).text('X'))
    );
  object.parent().before($elm);
}

function sHomeSmartBoxRealmSelectionUpdateSelected(object, selected){
  var formObj = object.closest('#smart-box-realm-selection-wrapper');
  // update the stored array
  object.data('selected', selected);

  // update the hidden field
  $("#edit-selected-realms", formObj).val(selected.join(','));

  // update the autocomplete
  var hasCourse = false;
  var hasGroup = false;
  var newList = [];
  $.each(Drupal.settings.s_home.valid_realms_list, function(k,v){
    var id = v.i;
    if($.inArray(id, selected) == -1){
      newList.push(v);
    }
    else if(id.search(/^course-/) != -1) {
      hasCourse = true;
    }
    else if(id.search(/^group-/) != -1) {
      hasGroup = true;
    }
  });

  object.setOptions({data: newList});
  if(hasCourse)
    $(".course-realm-only", formObj).show();
  else
    $(".course-realm-only", formObj).hide();

  if(hasGroup || hasCourse){
    $(".parent-post", formObj).show();
    $('.no-share:has(.hidden)', formObj).removeClass('hidden');
  }
  else{
    $(".parent-post", formObj).hide();
    $('.no-share:not(.hidden)', formObj).addClass('hidden');
  }


  object.trigger('sHomeSmartBoxRealmSelectionUpdate', [selected]);
  sHomeSmartBoxRealmSelectionPopupDateBehaviors();

}

function sHomeSmartBoxRealmSelectionPopupDateBehaviors(){
    var activePopup = Popups.activePopup();
    if(activePopup == null) {
      return;
    }
    var activePopupBody = $('#' + activePopup.id + ' .popups-body');
    if($('#calendar-form-container', activePopupBody).length == 0){
        return;
    }
    var formWrapper = activePopupBody.find('#calendar-form-container');
    formWrapper.find('.due-date').each(function() {
        sHomeSmartBoxSetStartDate(activePopupBody.attr('this-date'), $(this));
    });
    sPopupsResizeCenter();
}

function sHomeSmartBoxSetStartDate(dateStr, dateStartInput, allDay) {
    var date = new Date(dateStr);
    var day = date.getDate();
    if(day < 10){
      day = '0' + day.toString();
    }
    var year = date.getFullYear().toString().substring(2);
    var dayStr = (date.getMonth()+1) + '/' + day + '/' + year;

    // flip day/month for UK date-format
    if(Drupal.settings.s_common.date_format_language != undefined) {
      dayStr = Drupal.settings.s_common.date_format_language != 'en-GB' ? dayStr : day + '/' + (date.getMonth()+1)  + '/' + year
    }

    var hour = date.getHours();
    var minutes = date.getMinutes();
    var meridiem = (hour > 11) ? 'PM' : 'AM';
    minutes = (minutes < 10) ? '0' + minutes.toString() : minutes.toString();

    if(hour == 0) {
        hour = 12;
    }
    else if(hour > 12) {
        hour = hour - 12;
    }
    hour = (hour < 10) ? '0' + hour.toString() : hour.toString();
    var timeStr = hour + ':' + minutes + meridiem;

    if(dateStartInput.hasClass('due-date')) {
       dateStartInput.val(dayStr);
       var timeInputDDField = dateStartInput.parent().next().find('input');
       if($('#fcalendar').fullCalendar('getView').name != 'month' && !allDay) {
        timeInputDDField.val(timeStr);
       }
       else {
        timeInputDDField.val('11:59PM');
       }
    }
    else {
        dateStartInput.attr('defaultdate', dayStr);
        Drupal.attachBehaviors();
    }
};/*
 * jQuery Form Plugin
 * version: 2.25 (08-APR-2009)
 * @requires jQuery v1.2.2 or later
 * @note This has been modified for ajax.module
 * Examples and documentation at: http://malsup.com/jquery/form/
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 */
eval(function(p,a,c,k,e,r){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)r[e(c)]=k[c]||e(c);k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}(';(5($){$.B.1s=5(u){2(!4.G){R(\'1b: 2M 9 2N - 2O 2P 1t\');6 4}2(S u==\'5\')u={T:u};3 v=4.14(\'1c\')||1d.2Q.2R;v=(v.2S(/^([^#]+)/)||[])[1];v=v||\'\';u=$.1n({1e:v,H:4.14(\'1u\')||\'1Q\'},u||{});3 w={};4.L(\'C-1R-1S\',[4,u,w]);2(w.1T){R(\'1b: 9 1U 1o C-1R-1S L\');6 4}2(u.1v&&u.1v(4,u)===I){R(\'1b: 9 1f 1o 1v 1V\');6 4}3 a=4.1w(u.2T);2(u.J){u.O=u.J;K(3 n 1x u.J){2(u.J[n]2U 15){K(3 k 1x u.J[n])a.D({7:n,8:u.J[n][k]})}E a.D({7:n,8:u.J[n]})}}2(u.1y&&u.1y(a,4,u)===I){R(\'1b: 9 1f 1o 1y 1V\');6 4}4.L(\'C-9-1W\',[a,4,u,w]);2(w.1T){R(\'1b: 9 1U 1o C-9-1W L\');6 4}3 q=$.1z(a);2(u.H.2V()==\'1Q\'){u.1e+=(u.1e.2W(\'?\')>=0?\'&\':\'?\')+q;u.J=F}E u.J=q;3 x=4,V=[];2(u.2X)V.D(5(){x.1X()});2(u.2Y)V.D(5(){x.1Y()});2(!u.16&&u.17){3 y=u.T||5(){};V.D(5(a){$(u.17).2Z(a).P(y,1Z)})}E 2(u.T)V.D(u.T);u.T=5(a,b){K(3 i=0,M=V.G;i<M;i++)V[i].30(u,[a,b,x])};3 z=$(\'W:31\',4).18();3 A=I;K(3 j=0;j<z.G;j++)2(z[j])A=Q;2(u.20||A){2(u.21)$.32(u.21,1A);E 1A()}E $.33(u);4.L(\'C-9-34\',[4,u]);6 4;5 1A(){3 h=x[0];2($(\':W[7=9]\',h).G){35(\'36: 37 22 38 39 3a 3b "9".\');6}3 i=$.1n({},$.23,u);3 s=$.1n(Q,{},$.1n(Q,{},$.23),i);3 j=\'3c\'+(1B 3d().3e());3 k=$(\'<20 3f="\'+j+\'" 7="\'+j+\'" 24="25:26" />\');3 l=k[0];k.3g({3h:\'3i\',27:\'-28\',29:\'-28\'});3 m={1f:0,19:F,1g:F,3j:0,3k:\'n/a\',3l:5(){},2a:5(){},3m:5(){},3n:5(){4.1f=1;k.14(\'24\',\'25:26\')}};3 g=i.2b;2(g&&!$.1C++)$.1h.L("3o");2(g)$.1h.L("3p",[m,i]);2(s.2c&&s.2c(m,s)===I){s.2b&&$.1C--;6}2(m.1f)6;3 o=0;3 p=0;3 q=h.U;2(q){3 n=q.7;2(n&&!q.1i){u.O=u.O||{};u.O[n]=q.8;2(q.H=="X"){u.O[7+\'.x\']=h.Y;u.O[7+\'.y\']=h.Z}}}1j(5(){3 t=x.14(\'17\'),a=x.14(\'1c\');h.1k(\'17\',j);2(h.2d(\'1u\')!=\'2e\')h.1k(\'1u\',\'2e\');2(h.2d(\'1c\')!=i.1e)h.1k(\'1c\',i.1e);2(!u.3q){x.14({3r:\'2f/C-J\',3s:\'2f/C-J\'})}2(i.1D)1j(5(){p=Q;11()},i.1D);3 b=[];2g{2(u.O)K(3 n 1x u.O)b.D($(\'<W H="3t" 7="\'+n+\'" 8="\'+u.O[n]+\'" />\').2h(h)[0]);k.2h(\'1l\');l.2i?l.2i(\'2j\',11):l.3u(\'2k\',11,I);h.9()}3v{h.1k(\'1c\',a);t?h.1k(\'17\',t):x.3w(\'17\');$(b).2l()}},10);3 r=0;5 11(){2(o++)6;l.2m?l.2m(\'2j\',11):l.3x(\'2k\',11,I);3 c=Q;2g{2(p)3y\'1D\';3 d,N;N=l.2n?l.2n.2o:l.2p?l.2p:l.2o;2((N.1l==F||N.1l.2q==\'\')&&!r){r=1;o--;1j(11,2r);6}m.19=N.1l?N.1l.2q:F;m.1g=N.2s?N.2s:N;m.2a=5(a){3 b={\'3z-H\':i.16};6 b[a]};2(i.16==\'3A\'||i.16==\'3B\'){3 f=N.1E(\'1F\')[0];m.19=f?f.8:m.19}E 2(i.16==\'2t\'&&!m.1g&&m.19!=F){m.1g=2u(m.19)}d=$.3C(m,i.16)}3D(e){c=I;$.3E(i,m,\'2v\',e)}2(c){i.T(d,\'T\');2(g)$.1h.L("3F",[m,i])}2(g)$.1h.L("3G",[m,i]);2(g&&!--$.1C)$.1h.L("3H");2(i.2w)i.2w(m,c?\'T\':\'2v\');1j(5(){k.2l();m.1g=F},2r)};5 2u(s,a){2(1d.2x){a=1B 2x(\'3I.3J\');a.3K=\'I\';a.3L(s)}E a=(1B 3M()).3N(s,\'1G/2t\');6(a&&a.2y&&a.2y.1p!=\'3O\')?a:F}}};$.B.3P=5(c){6 4.2z().2A(\'9.C-1q\',5(){$(4).1s(c);6 I}).P(5(){$(":9,W:X",4).2A(\'2B.C-1q\',5(e){3 a=4.C;a.U=4;2(4.H==\'X\'){2(e.2C!=12){a.Y=e.2C;a.Z=e.3Q}E 2(S $.B.2D==\'5\'){3 b=$(4).2D();a.Y=e.2E-b.29;a.Z=e.2F-b.27}E{a.Y=e.2E-4.3R;a.Z=e.2F-4.3S}}1j(5(){a.U=a.Y=a.Z=F},10)})})};$.B.2z=5(){4.2G(\'9.C-1q\');6 4.P(5(){$(":9,W:X",4).2G(\'2B.C-1q\')})};$.B.1w=5(b){3 a=[];2(4.G==0)6 a;3 c=4[0];3 d=b?c.1E(\'*\'):c.22;2(!d)6 a;K(3 i=0,M=d.G;i<M;i++){3 e=d[i];3 n=e.7;2(!n)1H;2(b&&c.U&&e.H=="X"){2(!e.1i&&c.U==e)a.D({7:n+\'.x\',8:c.Y},{7:n+\'.y\',8:c.Z});1H}3 v=$.18(e,Q);2(v&&v.1r==15){K(3 j=0,2H=v.G;j<2H;j++)a.D({7:n,8:v[j]})}E 2(v!==F&&S v!=\'12\')a.D({7:n,8:v})}2(!b&&c.U){3 f=c.1E("W");K(3 i=0,M=f.G;i<M;i++){3 g=f[i];3 n=g.7;2(n&&!g.1i&&g.H=="X"&&c.U==g)a.D({7:n+\'.x\',8:c.Y},{7:n+\'.y\',8:c.Z})}}6 a};$.B.3T=5(a){6 $.1z(4.1w(a))};$.B.3U=5(b){3 a=[];4.P(5(){3 n=4.7;2(!n)6;3 v=$.18(4,b);2(v&&v.1r==15){K(3 i=0,M=v.G;i<M;i++)a.D({7:n,8:v[i]})}E 2(v!==F&&S v!=\'12\')a.D({7:4.7,8:v})});6 $.1z(a)};$.B.18=5(a){K(3 b=[],i=0,M=4.G;i<M;i++){3 c=4[i];3 v=$.18(c,a);2(v===F||S v==\'12\'||(v.1r==15&&!v.G))1H;v.1r==15?$.3V(b,v):b.D(v)}6 b};$.18=5(b,c){3 n=b.7,t=b.H,1a=b.1p.1I();2(S c==\'12\')c=Q;2(c&&(!n||b.1i||t==\'1m\'||t==\'3W\'||(t==\'1J\'||t==\'1K\')&&!b.1L||(t==\'9\'||t==\'X\')&&b.C&&b.C.U!=b||1a==\'13\'&&b.1M==-1))6 F;2(1a==\'13\'){3 d=b.1M;2(d<0)6 F;3 a=[],1N=b.3X;3 e=(t==\'13-2I\');3 f=(e?d+1:1N.G);K(3 i=(e?d:0);i<f;i++){3 g=1N[i];2(g.1t){3 v=g.8;2(!v)v=(g.1O&&g.1O[\'8\']&&!(g.1O[\'8\'].3Y))?g.1G:g.8;2(e)6 v;a.D(v)}}6 a}6 b.8};$.B.1Y=5(){6 4.P(5(){$(\'W,13,1F\',4).2J()})};$.B.2J=$.B.3Z=5(){6 4.P(5(){3 t=4.H,1a=4.1p.1I();2(t==\'1G\'||t==\'40\'||1a==\'1F\')4.8=\'\';E 2(t==\'1J\'||t==\'1K\')4.1L=I;E 2(1a==\'13\')4.1M=-1})};$.B.1X=5(){6 4.P(5(){2(S 4.1m==\'5\'||(S 4.1m==\'41\'&&!4.1m.42))4.1m()})};$.B.43=5(b){2(b==12)b=Q;6 4.P(5(){4.1i=!b})};$.B.2K=5(b){2(b==12)b=Q;6 4.P(5(){3 t=4.H;2(t==\'1J\'||t==\'1K\')4.1L=b;E 2(4.1p.1I()==\'2L\'){3 a=$(4).44(\'13\');2(b&&a[0]&&a[0].H==\'13-2I\'){a.45(\'2L\').2K(I)}4.1t=b}})};5 R(){2($.B.1s.46&&1d.1P&&1d.1P.R)1d.1P.R(\'[47.C] \'+15.48.49.4a(1Z,\'\'))}})(4b);',62,260,'||if|var|this|function|return|name|value|submit||||||||||||||||||||||||||||fn|form|push|else|null|length|type|false|data|for|trigger|max|doc|extraData|each|true|log|typeof|success|clk|callbacks|input|image|clk_x|clk_y||cb|undefined|select|attr|Array|dataType|target|a_fieldValue|responseText|tag|ajaxSubmit|action|window|url|aborted|responseXML|event|disabled|setTimeout|setAttribute|body|reset|extend|via|tagName|plugin|constructor|a_ajaxSubmit|selected|method|beforeSerialize|a_formToArray|in|beforeSubmit|param|fileUpload|new|active|timeout|getElementsByTagName|textarea|text|continue|toLowerCase|checkbox|radio|checked|selectedIndex|ops|attributes|console|GET|pre|serialize|veto|vetoed|callback|validate|a_resetForm|a_clearForm|arguments|iframe|closeKeepAlive|elements|ajaxSettings|src|about|blank|top|1000px|left|getResponseHeader|global|beforeSend|getAttribute|POST|multipart|try|appendTo|attachEvent|onload|load|remove|detachEvent|contentWindow|document|contentDocument|innerHTML|100|XMLDocument|xml|toXml|error|complete|ActiveXObject|documentElement|a_ajaxFormUnbind|bind|click|offsetX|offset|pageX|pageY|unbind|jmax|one|a_clearFields|a_selected|option|skipping|process|no|element|location|href|match|semantic|instanceof|toUpperCase|indexOf|resetForm|clearForm|html|apply|file|get|ajax|notify|alert|Error|Form|must|not|be|named|jqFormIO|Date|getTime|id|css|position|absolute|status|statusText|getAllResponseHeaders|setRequestHeader|abort|ajaxStart|ajaxSend|skipEncodingOverride|encoding|enctype|hidden|addEventListener|finally|removeAttr|removeEventListener|throw|content|json|script|httpData|catch|handleError|ajaxSuccess|ajaxComplete|ajaxStop|Microsoft|XMLDOM|async|loadXML|DOMParser|parseFromString|parsererror|a_ajaxForm|offsetY|offsetLeft|offsetTop|a_formSerialize|a_fieldSerialize|merge|button|options|specified|a_clearInputs|password|object|nodeType|a_enable|parent|find|debug|jquery|prototype|join|call|jQuery'.split('|'),0,{}));/**
 * Automatic ajax validation
 *
 * @see http://drupal.org/project/ajax
 * @see irc://freenode.net/#drupy
 * @depends Drupal 6
 * @author brendoncrawford
 * @note This file uses a 79 character width limit.
 * 
 *
 */

Drupal.Ajax = new Object;

Drupal.Ajax.plugins = {};

Drupal.Ajax.firstRun = false;

/**
 * Init function.
 * This is being executed by Drupal behaviours.
 * See bottom of script.
 * 
 * @param {HTMLElement} context
 * @return {Bool}
 */
Drupal.Ajax.init = function(context) {
  var f, s;
  if (f = $('.ajax-form:not(.AjaxProcessed)', context).addClass('AjaxProcessed')) {  
    if (!Drupal.Ajax.firstRun) {
      Drupal.Ajax.invoke('init');
      Drupal.Ajax.firstRun = true;
    }
    s = $('input[type="submit"]', f);
    s.click(function(e){
      var $submit = $(this);
      this.form.ajax_activator = $submit;
      //Allow us to handle pre-submit event by attach function callback to submit element
      var beforeSubmit = $submit.data('beforeSubmitHandler');
      if (typeof beforeSubmit === 'function') {
        beforeSubmit(e);
      }
      return true;
    });
    f.each(function(){
      this.ajax_activator = null;
      $(this).submit(function(){
        if (this.ajax_activator === null) {
          this.ajax_activator = $('.form-submit', this);
        }
        if (this.ajax_activator.hasClass('ajax-trigger')) {
          Drupal.Ajax.go($(this), this.ajax_activator);
          return false;
        }
        else {
          return true;
        }
      });
      return true;
    });
  }
  return true;
};

/**
 * Invokes plugins
 * 
 * @param {Object} formObj
 * @param {Object} submitter
 */
Drupal.Ajax.invoke = function(hook, args) {
  var plugin, r, ret;
  ret = true;
  for (plugin in Drupal.Ajax.plugins) {
    r = Drupal.Ajax.plugins[plugin](hook, args);
    if (r === false) {
      ret = false;
    }
  }
  return ret;
};

/**
 * Handles submission
 * 
 * @param {Object} submitter_
 * @return {Bool}
 */
Drupal.Ajax.go = function(formObj, submitter) {
  var submitterVal, submitterName, extraData;
  Drupal.Ajax.invoke('submit', {submitter:submitter});
  submitterVal = submitter.val();
  submitterName = submitter.attr('name');
  extraData = {};
  extraData[submitterName] = submitterVal;
  extraData['drupal_ajax'] = '1';
  formObj.a_ajaxSubmit({
    extraData : extraData,
    beforeSubmit : function(data) {
      data[data.length] = {
        name : submitterName,
        value : submitterVal
      };
      data[data.length] = {
        name : 'drupal_ajax',
        value : '1'
      };
      return true;
    },
    dataType : 'json',
    error: function (XMLHttpRequest, textStatus, errorThrown) {
      window.alert(Drupal.t('ajax.module: An unknown error has occurred.'));
      // log the error
      $.post('/popups_error', {
        'error': textStatus,
        'status' : XMLHttpRequest.status,
        'response' : XMLHttpRequest.responseText,
        'error_type' : 'ajax',
      });
      if (window.console) {
        console.log('error', arguments);
      }
      return true;
    },
    success: function(data){
      submitter.val(submitterVal);
      Drupal.Ajax.response(submitter, formObj, data);
      return true;
    }
  });
  return false;
};

/**
 * Handles messaging
 * 
 * @param {Object} formObj
 * @param {Object} submitter
 * @param {Object} data
 * @param {Object} options
 * @return {Bool}
 */
Drupal.Ajax.message = function(formObj, submitter, data, options) {
  var args; 
  data.local = {
    submitter : submitter,
    form : formObj
  };
  if (Drupal.Ajax.invoke('message', data)) {
    Drupal.Ajax.writeMessage(data.local.form, data.local.submitter, options);
    Drupal.Ajax.invoke('afterMessage', data);
  }
  return true;
};

/**
 * Writes message
 * 
 * @param {Object} formObj
 * @param {Object} submitter
 * @param {Object} options
 * @return {Bool}
 */
Drupal.Ajax.writeMessage = function(formObj, submitter, options) {
  var i, _i, thisItem, log, errBox, h, data;
  if (options.action === 'notify') {
    // Cleanups
    $('.messages, .ajax-preview', formObj).remove();
    $('input, textarea').removeClass('error status warning required');
    // Preview
    if (options.type === 'preview') {
      log = $('<div>').addClass('ajax-preview');
      log.html(options.messages);
      formObj.prepend(log);
    }
    // Status, Error, Message
    else {
      log = $('<ul>');
      errBox = $(".messages." + options.type, formObj[0])
      for (i = 0, _i = options.messages.length; i < _i; i++) {
        thisItem = $('#' + options.messages[i].id, formObj[0])
        thisItem.addClass(options.type);
        if (options.messages[i].required) {
          thisItem.addClass('required');
        }
        log.append('<li>' + options.messages[i].value + '</li>');
      }
      if (errBox.length === 0) {
        errBox = $("<div class='messages " + options.type + "'>");
        formObj.prepend(errBox);
      }
      errBox.html(log); 
    }
  }
  else if (options.action === 'clear') {
    $('.messages, .ajax-preview', formObj).remove();
  }
  return true;
};

/**
 * Updates message containers
 * 
 * @param {Object} updaters
 * @return {Bool}
 */
Drupal.Ajax.updater = function(updaters) {
  var i, _i, elm;
  for (i = 0, _i = updaters.length; i < _i; i++) {
    elm = $(updaters[i].selector);
    // HTML:IN
    if (updaters[i].type === 'html_in') {
      elm.html(updaters[i].value);
    }
    // HTML:OUT
    else if (updaters[i].type === 'html_out') {
      elm.replaceWith(updaters[i].value);
    }
    // FIELD
    else if (updaters[i].type === 'field') {
      elm.val(updaters[i].value);
    }
    // REMOVE
    else if(updaters[i].type === 'remove') {
      elm.remove();
    }
  }
  return true;
};

/**
 * Handles data response
 * 
 * @param {Object} submitter
 * @param {Object} formObj
 * @param {Object} data
 * @return {Bool}
 */
Drupal.Ajax.response = function(submitter, formObj, data){
  var newSubmitter;
  data.local = {
    submitter : submitter,
    form : formObj
  };
  /**
   * Failure
   */
  if (data.status === false) {
    Drupal.Ajax.updater(data.updaters);
    Drupal.Ajax.message(formObj, submitter, data, {
      action : 'notify',
      messages : data.messages_error,
      type : 'error'
    });
  }
  /**
   * Success
   */
  else {
    // Display preview
    if (data.preview !== null) {
      Drupal.Ajax.updater(data.updaters);
      Drupal.Ajax.message(formObj, submitter, data, {
        action : 'notify',
        messages : decodeURIComponent(data.preview),
        type : 'preview'
      });
    }
    // If no redirect, then simply show messages
    else if (data.redirect === null) {
      if (data.messages_status.length > 0) {
        Drupal.Ajax.message(formObj, submitter, data, {
          action : 'notify',
          messages : data.messages_status,
          type : 'status'
        });
      }
      if (data.messages_warning.length > 0) {
        Drupal.Ajax.message(formObj, submitter, data, {
          action : 'notify',
          messages : data.messages_warning,
          type : 'warning'
        });
      }
      if (data.messages_status.length === 0 &&
          data.messages_warning.length === 0) {
        Drupal.Ajax.message(formObj, submitter, data, {action:'clear'});
      }
    }
    // Redirect
    else {
      if (Drupal.Ajax.invoke('redirect', data)) {
        Drupal.Ajax.redirect( data.redirect );
      }
      else {
        Drupal.Ajax.updater(data.updaters);
        if (data.messages_status.length === 0 &&
            data.messages_warning.length === 0) {
          Drupal.Ajax.message(formObj, submitter, data, {action:'clear'});
        }
        else {
          Drupal.Ajax.message(formObj, submitter, data, {
            action : 'notify',
            messages : data.messages_status,
            type : 'status'
          });
        }
      }
    }
  }
  return true;
};


/**
 * Redirects to appropriate page
 * 
 * @todo
 *   Some of this functionality should possibly hapen on
 *   the server instead of client.
 * @param {String} url
 */
Drupal.Ajax.redirect = function(url) {
  window.location.href = url;
};

Drupal.behaviors.Ajax = Drupal.Ajax.init;



;Drupal.behaviors.sAppLogout = function(context) {

	$('#header:not(.sAppLogout-processed)').addClass('sAppLogout-processed').on('click', 'a.logout', function(e){
		$.ajax({
			type: 'GET',
			url: '/apps/logout/saml',
			cache: false,
			dataType: 'json',
			success: function(data){
				if (!Drupal.settings.hasOwnProperty('s_app')){
					Drupal.settings.s_app = {};
					Drupal.settings.s_app.num_assocs = data.num_associations;
				}
				var buttons = {};
				var popup = new Popups.Popup();
				popup.extraClass = 'popups-small app-logout no-buttons';
				if(data.num_associations > 0){
					Popups.open(popup, Drupal.t('App Logout'), data.html, buttons);
					sAppLogoutTimer('#' + $('.popups-box').attr('id'));
					Drupal.attachBehaviors();
				}
				//If no apps were logged into then we want a plain redirect to the normal logout page
				else{
					window.location = '/logout?force&ltoken='+sAppLogoutGetLogoutToken();
				}

			},
			error: function(html){
				window.location = '/logout?force&ltoken='+sAppLogoutGetLogoutToken();
			}
		});
		return false;
	})
}

function sAppLogoutSuccess(data){
  var wrapper = $('tr#app-' + data);

  if(wrapper.hasClass('done')){
    return;
  }

  $('.pending', wrapper).hide();
  $('.success', wrapper).show();

  wrapper.addClass('done');

  Drupal.settings.s_app.num_assocs--;
  if(Drupal.settings.s_app.num_assocs <= 0){
	  window.location = '/logout?ltoken='+sAppLogoutGetLogoutToken();
  }
}

//Allow apps x seconds to logout. After that, show error and a manual logout link.
function sAppLogoutTimer(context){
	$('#app-logout-wrapper:not(.sAppLogout-processed)', context).addClass('sAppLogout-processed').each(function(){
    var wrapper = $(this);
    var time = 10;
    setTimeout(function(){
      $('table tr:not(.done)', wrapper).each(function(){
        var row = $(this);

        $('.pending', row).hide();
        $('.error', row).show();

        row.addClass('done');
      });

      $('#logout-force').show();
      $('.popups-box').removeClass('no-buttons');
      sPopupsResizeCenter();
    }, time*1000)
  });
}

// Return logout token if it is provided by Drupal.settings.
function sAppLogoutGetLogoutToken(){
  return Drupal.settings.s_common.hasOwnProperty('logout_token')
    ? Drupal.settings.s_common.logout_token
    : '';
}
;(function () {
  /**
   * Prevent this from being declared multiple times
   */
  if (window._initPendo) {
    return;
  }

  /**
   * Defines a method on `window` to initialize the Pendo.io application
   * @see https://app.pendo.io/admin/settings
   * @param {Object} visitor A subset of the user object
   * @param {Object} account Some school info
   * @param {String} apiKey The provided API key
   */
  window._initPendo = function(visitor, account, apiKey) {
    // Prevent pendo from being initialized multiple times
    if (window._pendoInitialized) {
      return;
    }

    // Pendo engine loading
    (function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=[];
    v=['initialize','identify','updateOptions','pageLoad'];for(w=0,x=v.length;w<x;++w)(function(m){
    o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
    y=e.createElement(n);y.async=!0;y.src='https://ustats-cdn.schoology.com/agent/static/'+apiKey+'/pendo.js';
    z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');

    // Call this whenever information about your visitors becomes available
    // Please use Strings, Numbers, or Bools for value types.
    pendo.initialize({
      apiKey: apiKey,
      visitor: visitor,
      account: account
    });

    // Prevent initializing pendo multiple times
    // This could occur from AJAX popups
    window._pendoInitialized = true;
  }
})();
;
