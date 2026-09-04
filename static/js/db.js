// IndexedDB Storage Layer for SessionFlow AI
const DB_NAME = 'SessionFlowAI_DB';
const DB_VERSION = 1;

class SessionDB {
  constructor() {
    this.db = null;
    this.readyPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Transcripts store
        if (!db.objectStoreNames.contains('transcripts')) {
          const transStore = db.createObjectStore('transcripts', { keyPath: 'id', autoIncrement: true });
          transStore.createIndex('sessionId', 'sessionId', { unique: false });
          transStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Images / OCR store
        if (!db.objectStoreNames.contains('images')) {
          const imgStore = db.createObjectStore('images', { keyPath: 'id' });
          imgStore.createIndex('sessionId', 'sessionId', { unique: false });
          imgStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Analysis store (process flow, mermaid, glossary)
        if (!db.objectStoreNames.contains('analysis')) {
          const analysisStore = db.createObjectStore('analysis', { keyPath: 'sessionId' });
        }

        // Chat messages store
        if (!db.objectStoreNames.contains('chat')) {
          const chatStore = db.createObjectStore('chat', { keyPath: 'id', autoIncrement: true });
          chatStore.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB SessionFlowAI inicializado correctamente');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ready() {
    return this.readyPromise;
  }

  // --- SESSIONS ---
  async saveSession(session) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readwrite');
      const store = tx.objectStore('sessions');
      const item = {
        ...session,
        updatedAt: new Date().toISOString()
      };
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getSession(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllSessions() {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const index = store.index('updatedAt');
      const req = index.openCursor(null, 'prev');
      const results = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteSession(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions', 'transcripts', 'images', 'analysis', 'chat'], 'readwrite');
      tx.objectStore('sessions').delete(id);
      
      // Delete associated transcripts
      const transStore = tx.objectStore('transcripts');
      const transIndex = transStore.index('sessionId');
      transIndex.openCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          transStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      // Delete associated images
      const imgStore = tx.objectStore('images');
      const imgIndex = imgStore.index('sessionId');
      imgIndex.openCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          imgStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.objectStore('analysis').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- TRANSCRIPTS ---
  async addTranscript(item) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['transcripts'], 'readwrite');
      const store = tx.objectStore('transcripts');
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getTranscriptsBySession(sessionId) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['transcripts'], 'readonly');
      const store = tx.objectStore('transcripts');
      const index = store.index('sessionId');
      const req = index.getAll(sessionId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // --- IMAGES & OCR ---
  async saveImage(imageItem) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['images'], 'readwrite');
      const store = tx.objectStore('images');
      const req = store.put(imageItem);
      req.onsuccess = () => resolve(imageItem);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getImagesBySession(sessionId) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['images'], 'readonly');
      const store = tx.objectStore('images');
      const index = store.index('sessionId');
      const req = index.getAll(sessionId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteImage(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['images'], 'readwrite');
      const req = tx.objectStore('images').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // --- ANALYSIS ---
  async saveAnalysis(analysisData) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['analysis'], 'readwrite');
      const store = tx.objectStore('analysis');
      const req = store.put(analysisData);
      req.onsuccess = () => resolve(analysisData);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAnalysis(sessionId) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['analysis'], 'readonly');
      const store = tx.objectStore('analysis');
      const req = store.get(sessionId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // --- CHAT ---
  async addChatMessage(msg) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['chat'], 'readwrite');
      const store = tx.objectStore('chat');
      const req = store.add(msg);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getChatBySession(sessionId) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['chat'], 'readonly');
      const store = tx.objectStore('chat');
      const index = store.index('sessionId');
      const req = index.getAll(sessionId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }
}

export const db = new SessionDB();
