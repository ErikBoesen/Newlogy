all: zip

zip:
	zip -r archive manifest.json *.html *.css *.js icons

publish:
	webstore publish --extension-id bjcabjilfhmoahlpkffklacegnndmbbb
