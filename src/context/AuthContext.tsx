"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface User {
    name: string;
    email: string;
    id: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, pass: string) => Promise<void>;
    signup: (name: string, email: string, pass: string) => Promise<void>;
    loginWithSocial: (provider: "google" | "facebook") => Promise<void>;
    verifyPhone: (phone: string) => Promise<void>;
    loginWithPhone: (phone: string, otp: string) => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    /**
     * Fetches profile from DB. For OAuth users, upserts the profile row
     * if it doesn't exist yet (DB trigger may not have run yet).
     */
    const getOrCreateProfile = async (supabaseUser: { id: string; email?: string; user_metadata?: { full_name?: string; name?: string } }) => {
        if (!supabaseUser) return null;

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', supabaseUser.id)
            .single();

        if (profile) {
            return {
                id: profile.id,
                name: profile.full_name || profile.email?.split('@')[0] || "User",
                email: profile.email || ""
            };
        }

        // Profile missing — upsert it (handles OAuth users whose trigger hasn't fired)
        const meta = supabaseUser.user_metadata ?? {};
        const fullName = meta.full_name || meta.name || supabaseUser.email?.split('@')[0] || "User";
        const { data: created } = await supabase
            .from('profiles')
            .upsert({ id: supabaseUser.id, email: supabaseUser.email, full_name: fullName }, { onConflict: 'id' })
            .select()
            .single();

        if (created) {
            return { id: created.id, name: created.full_name || "User", email: created.email || "" };
        }

        return null;
    };

    useEffect(() => {
        const initSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) {
                    console.warn("Auth initialization warning:", error.message);
                    if (error.status === 400 || error.message.toLowerCase().includes("refresh token")) {
                        // Clear invalid/stale local session data
                        await supabase.auth.signOut({ scope: 'local' });
                        setUser(null);
                    }
                } else if (session?.user) {
                    const profile = await getOrCreateProfile(session.user);
                    if (profile) setUser(profile);
                }
            } catch (e) {
                console.error("Auth initialization fatal error:", e);
            } finally {
                setLoading(false);
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event: string, session: any) => {
                if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setLoading(false);
                    return;
                }

                if (session?.user) {
                    const profile = await getOrCreateProfile(session.user);
                    if (profile) {
                        setUser(profile);
                        if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
                            const url = new URL(window.location.href);
                            if (url.pathname === '/login' || url.pathname === '/signup') {
                                router.push('/advisor');
                            }
                        }
                    }
                } else {
                    setUser(null);
                }
                setLoading(false);
            }
        );

        initSession();

        return () => { subscription.unsubscribe(); };
    }, [router]);

    const login = async (email: string, pass: string) => {
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) { setLoading(false); throw error; }
        if (data?.user) {
            const profile = await getOrCreateProfile(data.user);
            if (profile) setUser(profile);
        }
        setLoading(false);
    };

    const signup = async (name: string, email: string, pass: string) => {
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email, password: pass, options: { data: { full_name: name } },
        });
        if (error) { setLoading(false); throw error; }
        if (data?.user) {
            const profile = await getOrCreateProfile({ ...data.user, user_metadata: { full_name: name } });
            if (profile) setUser(profile);
        }
        setLoading(false);
    };

    const loginWithSocial = async (provider: "google" | "facebook") => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${origin}/advisor`,
                queryParams: { access_type: 'offline', prompt: 'consent' },
            }
        });
        if (error) throw error;
    };

    const verifyPhone = async (phone: string) => {
        const { error } = await supabase.auth.signInWithOtp({
            phone,
        });
        if (error) throw error;
    };

    const loginWithPhone = async (phone: string, otp: string) => {
        const { error } = await supabase.auth.verifyOtp({
            phone,
            token: otp,
            type: 'sms',
        });
        if (error) throw error;
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        router.push("/");
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, loginWithSocial, verifyPhone, loginWithPhone, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
