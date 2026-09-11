class DataService {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.listeners = new Map();
  }

  async init() {
    if (this.initialized) return;
    
    try {
      const { initializeApp } = await import('firebase/app');
      const { getDatabase, ref, onValue, set, push, update, remove } = await import('firebase/database');
      
      const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY || 'demo-key',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://demo-project-default-rtdb.firebaseio.com',
        projectId: process.env.FIREBASE_PROJECT_ID || 'demo-project',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
        appId: process.env.FIREBASE_APP_ID || '1:123456789:web:abcdef'
      };

      const app = initializeApp(firebaseConfig);
      this.db = getDatabase(app);
      this.initialized = true;
      console.log('Firebase initialized successfully');
    } catch (error) {
      console.warn('Firebase not available, using localStorage fallback:', error.message);
      this.useLocalStorage = true;
    }
  }

  async saveGameManager(gameManager) {
    const data = gameManager.toJSON();
    
    if (this.useLocalStorage) {
      localStorage.setItem('futbolra-game', JSON.stringify(data));
      this.notifyListeners('game', data);
      return;
    }

    try {
      const { ref, set } = await import('firebase/database');
      await set(ref(this.db, 'game'), data);
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      localStorage.setItem('futbolra-game', JSON.stringify(data));
    }
  }

  async loadGameManager() {
    if (this.useLocalStorage) {
      const data = localStorage.getItem('futbolra-game');
      return data ? JSON.parse(data) : null;
    }

    try {
      const { ref, get } = await import('firebase/database');
      const snapshot = await get(ref(this.db, 'game'));
      return snapshot.val();
    } catch (error) {
      console.error('Error loading from Firebase:', error);
      const data = localStorage.getItem('futbolra-game');
      return data ? JSON.parse(data) : null;
    }
  }

  async subscribeToGame(callback) {
    if (this.useLocalStorage) {
      const listener = (e) => {
        if (e.key === 'futbolra-game' && e.newValue) {
          callback(JSON.parse(e.newValue));
        }
      };
      window.addEventListener('storage', listener);
      this.listeners.set(callback, listener);
      return () => window.removeEventListener('storage', listener);
    }

    try {
      const { ref, onValue } = await import('firebase/database');
      const unsubscribe = onValue(ref(this.db, 'game'), (snapshot) => {
        callback(snapshot.val());
      });
      this.listeners.set(callback, unsubscribe);
      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to Firebase:', error);
      return () => {};
    }
  }

  unsubscribeFromGame(callback) {
    const unsubscribe = this.listeners.get(callback);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(callback);
    }
  }

  notifyListeners(key, data) {
    window.dispatchEvent(new StorageEvent('storage', {
      key: key,
      newValue: JSON.stringify(data)
    }));
  }

  async saveParticipants(participants) {
    const data = participants.map(p => p.toJSON());
    
    if (this.useLocalStorage) {
      localStorage.setItem('futbolra-participants', JSON.stringify(data));
      return;
    }

    try {
      const { ref, set } = await import('firebase/database');
      await set(ref(this.db, 'participants'), data);
    } catch (error) {
      console.error('Error saving participants:', error);
      localStorage.setItem('futbolra-participants', JSON.stringify(data));
    }
  }

  async loadParticipants() {
    if (this.useLocalStorage) {
      const data = localStorage.getItem('futbolra-participants');
      return data ? JSON.parse(data) : [];
    }

    try {
      const { ref, get } = await import('firebase/database');
      const snapshot = await get(ref(this.db, 'participants'));
      return snapshot.val() || [];
    } catch (error) {
      console.error('Error loading participants:', error);
      const data = localStorage.getItem('futbolra-participants');
      return data ? JSON.parse(data) : [];
    }
  }

  async savePot(amount) {
    if (this.useLocalStorage) {
      localStorage.setItem('futbolra-pot', amount.toString());
      return;
    }

    try {
      const { ref, set } = await import('firebase/database');
      await set(ref(this.db, 'pot'), amount);
    } catch (error) {
      console.error('Error saving pot:', error);
      localStorage.setItem('futbolra-pot', amount.toString());
    }
  }

  async loadPot() {
    if (this.useLocalStorage) {
      return parseInt(localStorage.getItem('futbolra-pot') || '0', 10);
    }

    try {
      const { ref, get } = await import('firebase/database');
      const snapshot = await get(ref(this.db, 'pot'));
      return snapshot.val() || 0;
    } catch (error) {
      console.error('Error loading pot:', error);
      return parseInt(localStorage.getItem('futbolra-pot') || '0', 10);
    }
  }
}

const dataService = new DataService();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DataService, dataService };
}