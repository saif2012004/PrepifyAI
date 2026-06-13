import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { authService } from '../services/authService';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider?: 'email' | 'google';
  role?: 'student' | 'admin';
  class?: string;
  instituteName?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (profile: any) => void;
  updateProfile: (updates: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    checkExistingAuth();
  }, []);

  /**
   * Check if user has a valid token and fetch user data
   */
  const checkExistingAuth = async () => {
    try {
      const hasToken = await authService.hasToken();
      if (hasToken) {
        // Try to fetch user data
        const userData = await authService.getCurrentUser();
        setUser(mapBackendUserToLocal(userData));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const stale = /credential|401|unauthor|validate credentials|not authenticated/i.test(msg);
      if (stale) {
        console.log('Auth: stored session invalid or expired — cleared. Sign in again.');
      } else {
        console.error('Error checking auth:', error);
      }
      await authService.logout();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Map backend user data to local User interface
   */
  const mapBackendUserToLocal = (backendUser: any): User => {
    return {
      id: String(backendUser.user_id),
      name: backendUser.name,
      email: backendUser.email,
      role: backendUser.role as 'student' | 'admin',
      class: backendUser.class_level,
      provider: 'email',
    };
  };

  /**
   * Login student user
   */
  const login = async (email: string, password: string) => {
    try {
      const res = await authService.login({ email, password });
      if (res.user) {
        setUser(mapBackendUserToLocal(res.user));
        return;
      }
      const userData = await authService.getCurrentUser();
      setUser(mapBackendUserToLocal(userData));
    } catch (error: unknown) {
      console.error('Login error:', error);
      const msg = error instanceof Error ? error.message : 'Login failed.';
      throw new Error(msg);
    }
  };

  /**
   * Login admin user (same endpoint, just convenience method)
   */
  const loginAdmin = async (email: string, password: string) => {
    try {
      const res = await authService.login({ email, password });
      const userData = res.user ?? (await authService.getCurrentUser());
      if (userData.role !== 'admin') {
        await authService.logout();
        throw new Error('This account does not have admin privileges');
      }
      setUser(mapBackendUserToLocal(userData));
    } catch (error: unknown) {
      console.error('Admin login error:', error);
      const msg = error instanceof Error ? error.message : 'Admin login failed.';
      throw new Error(msg);
    }
  };

  /**
   * Register new student user
   */
  const register = async (name: string, email: string, password: string) => {
    try {
      const res = await authService.register({
        name,
        email,
        password,
        role: 'student',
        class_level: undefined,
      });
      setUser(mapBackendUserToLocal(res.user));
    } catch (error: unknown) {
      console.error('Registration error:', error);
      const msg = error instanceof Error ? error.message : 'Registration failed. Please try again.';
      throw new Error(msg);
    }
  };

  /**
   * Login with Google (keeping for future implementation)
   */
  const loginWithGoogle = (profile: any) => {
    // TODO: Implement Google OAuth with backend
    // For now, use mock data
    const userData: User = {
      id: profile.id || profile.sub || 'google-user',
      name: profile.name || 'Google User',
      email: profile.email,
      avatar: profile.picture,
      provider: 'google',
      role: 'student',
    };
    setUser(userData);
  };

  /**
   * Update user profile
   */
  const updateProfile = async (updates: Partial<User>) => {
    try {
      if (!user) return;
      
      // Map local updates to backend format
      const backendUpdates: any = {};
      if (updates.name) backendUpdates.name = updates.name;
      if (updates.email) backendUpdates.email = updates.email;
      if (updates.class) backendUpdates.class_level = updates.class;
      
      // Update on backend
      const updatedUser = await authService.updateUser(backendUpdates);
      
      // Update local state
      setUser(mapBackendUserToLocal(updatedUser));
    } catch (error: any) {
      console.error('Update profile error:', error);
      throw new Error(error.message || 'Failed to update profile');
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: (user?.role ?? '').toLowerCase() === 'admin',
        isLoading,
        login,
        loginAdmin,
        register,
        loginWithGoogle,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
