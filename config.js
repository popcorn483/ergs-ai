// AI in School newsletter settings.
// The Firebase values are public by design: the Firestore rules decide who can release issues.
window.NL_CONFIG = {
  // ERGS AI's own Firebase project
  firebase: {
    apiKey: 'AIzaSyBXg8-D_AIJPbMIB88S8UCnXk40_tJLfd8',
    authDomain: 'ergs-ai.firebaseapp.com',
    projectId: 'ergs-ai',
    storageBucket: 'ergs-ai.firebasestorage.app',
    messagingSenderId: '146609666086',
    appId: '1:146609666086:web:ac6cd0027fcf75aa554ee7'
  },
  // The old shared project – only used once, by the editor, to bring existing data across
  oldFirebase: {
    apiKey: 'AIzaSyBvMYvV6mZral-L7i7jCQ0Sr-73YaGjXag',
    authDomain: 'ergs-live.firebaseapp.com',
    projectId: 'ergs-live',
    storageBucket: 'ergs-live.firebasestorage.app',
    messagingSenderId: '1104768412',
    appId: '1:1104768412:web:f34a84195be98eb2a2ac59'
  },
  // The account that can release and add issues (C2k: either address works)
  admins: ['jbutler803@c2ken.net', 'jbutler803@c2kni.net', 'jbutler483@gmail.com'],
  // Staff password key derivation (do not change unless content is re-encrypted)
  salt: 'jsTC70mVZJH1oXP1liyuCA==',
  iterations: 200000
};
