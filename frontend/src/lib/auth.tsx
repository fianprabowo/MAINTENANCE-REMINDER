"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { User, AuthResponse } from "./types";
import { api } from "./api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string | null, phone: string | null, password: string) => Promise<void>;
  register: (name: string, email: string | null, phone: string | null, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await api.get<User>("/auth/profile");
      if (res.data) setUser(res.data);
    } catch {
      localStorage.removeItem("token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const login = async (email: string | null, phone: string | null, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", { email, phone, password });
    if (!res.success || !res.data?.token || !res.data?.user) {
      throw new Error(res.message || "Login failed");
    }
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  };

  const register = async (name: string, email: string | null, phone: string | null, password: string) => {
    const res = await api.post<AuthResponse>("/auth/register", { name, email, phone, password });
    if (!res.success || !res.data?.token || !res.data?.user) {
      throw new Error(res.message || "Registration failed");
    }
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
