import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpCircle, Coins, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function QuizTaker({ quizId, onDone }: { quizId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const { data: quiz, isLoading } = trpc.gamification.getQuiz.useQuery({ quizId });
  const submitMutation = trpc.gamification.submitQuiz.useMutation();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean; reward: number } | null>(null);

  if (isLoading || !quiz) return <p className="text-[13px] text-muted-foreground py-6 text-center">লোড হচ্ছে...</p>;

  const allAnswered = quiz.questions.every((_: any, i: number) => answers[i] !== undefined);

  const submit = async () => {
    const answerArray = quiz.questions.map((_: any, i: number) => answers[i]);
    const res = await submitMutation.mutateAsync({ quizId, answers: answerArray }).catch(() => null);
    if (!res?.success) {
      toast.info(res?.reason === "already_attempted" ? "আপনি ইতোমধ্যে এই কুইজ দিয়েছেন" : "সাবমিট ব্যর্থ হয়েছে");
      onDone();
      return;
    }
    setResult(res);
    utils.gamification.listActiveQuizzes.invalidate();
    if (res.passed) toast.success(`🎉 পাস করেছেন! +${res.reward} কয়েন`);
  };

  if (result) {
    return (
      <div className="text-center py-6 space-y-3">
        <CheckCircle2 className={`w-12 h-12 mx-auto ${result.passed ? "text-emerald-500" : "text-muted-foreground"}`} />
        <p className="text-lg font-bold">{result.score} / {result.total} সঠিক</p>
        <p className="text-sm text-muted-foreground">{result.passed ? `আপনি পাস করেছেন — +${result.reward} কয়েন যোগ হয়েছে` : "এবার পাস করেননি, তবে চিন্তা নেই!"}</p>
        <Button onClick={onDone} className="w-full">বন্ধ করুন</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      {quiz.questions.map((q: any, qi: number) => (
        <div key={q.id} className="space-y-2">
          <p className="text-[13px] font-medium">{qi + 1}. {q.question}</p>
          <div className="space-y-1.5">
            {(q.options as string[]).map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                className={`w-full text-left px-3 py-2 rounded-lg border text-[13px] transition-colors ${
                  answers[qi] === oi ? "border-primary bg-primary/10 text-primary" : "border-border/20 bg-secondary/10 hover:bg-secondary/20"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={submit} disabled={!allAnswered || submitMutation.isPending} className="w-full">
        {submitMutation.isPending ? "সাবমিট হচ্ছে..." : "সাবমিট করুন"}
      </Button>
    </div>
  );
}

export function QuizList() {
  const { data: quizzes = [] } = trpc.gamification.listActiveQuizzes.useQuery();
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  if (quizzes.length === 0) return null;

  return (
    <Card className="border-border/30 mb-6">
      <CardHeader>
        <CardTitle className="text-base font-serif flex items-center gap-2"><HelpCircle className="w-4 h-4 text-primary" /> কুইজ খেলুন</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(quizzes as any[]).map((q) => (
          <div key={q.id} className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-secondary/10">
            <div>
              <p className="text-[13px] font-medium">{q.title}</p>
              {q.description && <p className="text-[11px] text-muted-foreground">{q.description}</p>}
              <Badge variant="outline" className="mt-1 text-[10px]"><Coins className="w-2.5 h-2.5 mr-0.5" />{q.coin_reward} কয়েন</Badge>
            </div>
            {q.attempt ? (
              <Badge className={q.attempt.passed ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}>
                {q.attempt.score}/{q.attempt.total}
              </Badge>
            ) : (
              <Button size="sm" onClick={() => setActiveQuizId(q.id)}>খেলুন</Button>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={!!activeQuizId} onOpenChange={(open) => !open && setActiveQuizId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>কুইজ</DialogTitle></DialogHeader>
          {activeQuizId && <QuizTaker quizId={activeQuizId} onDone={() => setActiveQuizId(null)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
