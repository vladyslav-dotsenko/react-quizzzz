git checkout main &&
git branch -D gh-pages &&
git branch gh-pages &&
git checkout gh-pages &&
npm install &&
VITE_BASE_URL='/react-quizzzz/' npm run build &&
git add ./dist -f &&
git commit -a -m 'release. gh-pages build' &&
git push origin `git subtree split --prefix dist gh-pages`:gh-pages --force &&
git checkout -
