all: zip

zip:
	zip -r archive manifest.json *.css *.js *.png
