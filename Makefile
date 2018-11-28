all: zip

zip:
	zip -r archive manifest.json *.html *.css *.js icons
