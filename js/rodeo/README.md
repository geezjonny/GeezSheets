# Rodeo

`rodeo.html` is the isolated Rodeo entry page. The new entry/runtime files are `main.js`, `rodeo.css`, `scene.js`, and `sync.js`; they provide the join card, offline table shell, canvas grid, toolbar, room persistence façade, and dice log. Existing untracked modules in this directory are preserved.

Run with `serve.cmd` and open `http://127.0.0.1:8000/rodeo.html`; add `?room=name&db=local` when using the local database adapter.

Known gap: the repository already contained a separate untracked `js/rodeo` implementation with colliding helper/test filenames. Those files were not overwritten, so its existing tests are not the tests for this entry shell.
