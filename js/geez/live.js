// Live reads over the Firebase SDK's one socket. Never use EventSource on the database: each one holds one of the
// browser's six connections to it (all tabs together), and once they are full every save times out.
// Its own app: rodeo-firebase.js may be the Gaia character view (?db=gaia), which does not carry these paths.
const CDN = 'https://www.gstatic.com/firebasejs/11.1.0';
let sdk;
export async function live(path, onData, onError) {
  sdk ||= Promise.all([import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-database.js`)])
    .then(([app, database]) => ({ ...database, db: database.getDatabase(app.initializeApp(window.GEEZ_FIREBASE_CONFIG, 'live')) }));
  const { db, ref, onValue } = await sdk;
  return onValue(ref(db, path), (snapshot) => onData(snapshot.val()), onError);
}
