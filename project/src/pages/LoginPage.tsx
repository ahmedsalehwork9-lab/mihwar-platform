import { useState } from "react";
import { Eye, EyeOff, Truck } from "lucide-react";

import { supabase } from "../lib/supabase";
import { useLang } from "../context/LanguageContext";

export default function LoginPage() {

  const { lang, setLang, isRTL } =
    useLang();

  const [isLogin, setIsLogin] =
    useState(true);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  // AUTH
  const handleAuth = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    try {

      setLoading(true);
      setError("");

      // LOGIN
      if (isLogin) {

        const { error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) {
          setError(error.message);
          return;
        }

        window.location.href = "/";
      }

      // REGISTER
      else {

        const { error } =
          await supabase.auth.signUp({
            email,
            password,
          });

        if (error) {
          setError(error.message);
          return;
        }

        alert(
          "تم إنشاء الحساب بنجاح، تحقق من بريدك الإلكتروني لتأكيد الحساب"
        );

        setIsLogin(true);
      }

    } catch (err: any) {

      setError(
        err.message ||
        "حدث خطأ"
      );

    } finally {

      setLoading(false);

    }
  };

  return (

    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4"
    >

      {/* BG EFFECT */}
      <div className="absolute inset-0 overflow-hidden">

        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 blur-3xl rounded-full" />

        <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/10 blur-3xl rounded-full" />
      </div>

      {/* CARD */}
      <div className="relative w-full max-w-md">

        {/* LANGUAGE */}
        <div className="flex justify-end mb-4">

          <button
            onClick={() =>
              setLang(
                lang === "en" ? "ar" : "en"
              )
            }
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-600 bg-slate-900/50 backdrop-blur-md text-slate-300 hover:text-white transition-all"
          >
            🌐{" "}
            {lang === "en"
              ? "العربية"
              : "English"}
          </button>
        </div>

        {/* LOGIN BOX */}
        <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl p-8">

          {/* LOGO */}
          <div className="flex flex-col items-center mb-8">

            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-5">

              <Truck
                size={28}
                className="text-white"
              />
            </div>

            <h1 className="text-3xl font-bold text-white text-center">
              {lang === "ar"
                ? "إيسوزو بارتس السعودية"
                : "Isuzu Parts Saudi"}
            </h1>

            <p className="text-slate-400 mt-2 text-center">
              {lang === "ar"
                ? "منصة قطع الغيار للشركات"
                : "B2B Spare Parts Platform"}
            </p>
          </div>

          {/* TABS */}
          <div className="flex bg-slate-950 rounded-2xl p-1 mb-6">

            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                isLogin
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400"
              }`}
            >
              {lang === "ar"
                ? "تسجيل الدخول"
                : "Login"}
            </button>

            <button
              onClick={() =>
                setIsLogin(false)
              }
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                !isLogin
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400"
              }`}
            >
              {lang === "ar"
                ? "إنشاء حساب"
                : "Register"}
            </button>
          </div>

          {/* FORM */}
          <form
            onSubmit={handleAuth}
            className="space-y-5"
          >

            {/* EMAIL */}
            <div>

              <label className="block text-sm text-slate-300 mb-2">

                {lang === "ar"
                  ? "البريد الإلكتروني"
                  : "Email"}
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
                className="w-full h-14 px-4 rounded-2xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {/* PASSWORD */}
            <div>

              <label className="block text-sm text-slate-300 mb-2">

                {lang === "ar"
                  ? "كلمة المرور"
                  : "Password"}
              </label>

              <div className="relative">

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  required
                  className="w-full h-14 px-4 rounded-2xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500 transition-all"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-500 hover:text-white ${
                    isRTL
                      ? "left-4"
                      : "right-4"
                  }`}
                >
                  {showPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
            </div>

            {/* ERROR */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl px-4 py-3">
                {error}
              </div>
            )}

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-lg transition-all shadow-lg shadow-blue-500/20"
            >
              {loading
                ? lang === "ar"
                  ? "جاري التحميل..."
                  : "Loading..."
                : isLogin
                ? lang === "ar"
                  ? "تسجيل الدخول"
                  : "Login"
                : lang === "ar"
                ? "إنشاء حساب"
                : "Create Account"}
            </button>
          </form>

          {/* FOOTER */}
          <div className="mt-8 text-center text-sm text-slate-500">
            support@isuzuparts.sa
          </div>
        </div>
      </div>
    </div>
  );
}