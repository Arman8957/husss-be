import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private firebaseApp: admin.app.App | null = null;
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      const projectId = this.configService.get<string>('firebase.projectId');
      const privateKey = this.configService.get<string>('firebase.privateKey');
      const clientEmail = this.configService.get<string>('firebase.clientEmail');

      // Check if all required credentials are present
      if (!projectId || !privateKey || !clientEmail) {
        this.logger.warn(
          'Firebase credentials are incomplete. Firebase authentication will be disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in .env to enable Firebase.'
        );
        return;
      }

      // Clean the private key - remove extra quotes and ensure proper newlines
      const cleanedPrivateKey = privateKey
        .replace(/\\n/g, '\n')
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes if present
        .trim();

      // Validate the cleaned private key
      if (!cleanedPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Private key is not in the correct format. It should start with "-----BEGIN PRIVATE KEY-----"');
      }

      // Initialize Firebase only if not already initialized
      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: projectId.trim(),
            privateKey: cleanedPrivateKey,
            clientEmail: clientEmail.trim(),
          }),
        });
        this.logger.log('Firebase Admin SDK initialized successfully');
      } else {
        this.firebaseApp = admin.app();
        this.logger.log('Using existing Firebase app instance');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${error.message}`);
      this.firebaseApp = null;
    }
  }

  getAuth() {
    this.ensureInitialized();
    return this.firebaseApp!.auth();
  }

  async verifyIdToken(idToken: string) {
    this.ensureInitialized();
    
    try {
      return await this.firebaseApp!.auth().verifyIdToken(idToken);
    } catch (error: any) {
      throw new Error(`Invalid Firebase ID token: ${error.message}`);
    }
  }

  async createCustomToken(uid: string, additionalClaims?: any) {
    this.ensureInitialized();
    return this.firebaseApp!.auth().createCustomToken(uid, additionalClaims);
  }

  isInitialized(): boolean {
    return this.firebaseApp !== null;
  }

  private ensureInitialized(): void {
    if (!this.firebaseApp) {
      throw new Error(
        'Firebase is not initialized. Please check your Firebase configuration in .env file. ' +
        'Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL'
      );
    }
  }
}