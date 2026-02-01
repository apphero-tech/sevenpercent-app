import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Check } from "lucide-react";
import { Link } from "react-router-dom";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { user, loading, signInWithMagicLink } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      navigate("/demo");
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    const { error } = await signInWithMagicLink(email.trim());

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setEmailSent(true);
    }
    setIsLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-border">
        <Link 
          to="/" 
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>
        <span className="text-xl font-black">7%</span>
        <div className="w-16" />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          {emailSent ? (
            // Success state
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Check className="w-8 h-8 text-foreground" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">Check your email</h1>
                <p className="text-muted-foreground text-sm">
                  We sent a magic link to <span className="text-foreground">{email}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Click the link in your email to sign in. You can close this page.
              </p>
              <button 
                onClick={() => setEmailSent(false)} 
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            // Email input state
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Sign in</h1>
                <p className="text-muted-foreground text-sm">
                  Enter your email to receive a magic link
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-12 pl-10"
                  />
                </div>
                <Button 
                  type="submit" 
                  variant="hero" 
                  size="hero" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Continue"}
                </Button>
              </form>

              <p className="text-xs text-center text-muted-foreground">
                No password needed. We'll email you a secure link.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Auth;
