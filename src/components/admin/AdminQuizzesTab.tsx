import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Question {
  question: string;
  options: string[];
  correct_index: number;
}

const emptyQuestion = (): Question => ({ question: "", options: ["", ""], correct_index: 0 });

export function AdminQuizzesTab() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: quizzes = [], isLoading } = trpc.admin.listQuizzes.useQuery();
  const saveMutation = trpc.admin.upsertQuiz.useMutation({
    onSuccess: () => { utils.admin.listQuizzes.invalidate(); toast({ title: "Quiz saved" }); setOpen(false); },
    onError: (e) => toast({ title: "Failed to save quiz", description: e.message }),
  });
  const toggleMutation = trpc.admin.setQuizActive.useMutation({ onSuccess: () => utils.admin.listQuizzes.invalidate() });
  const deleteMutation = trpc.admin.deleteQuiz.useMutation({ onSuccess: () => utils.admin.listQuizzes.invalidate() });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coinReward, setCoinReward] = useState("10");
  const [passPercentage, setPassPercentage] = useState("60");
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);

  const openNew = () => {
    setEditId(null); setTitle(""); setDescription(""); setCoinReward("10"); setPassPercentage("60");
    setQuestions([emptyQuestion()]);
    setOpen(true);
  };

  const openEdit = (q: any) => {
    setEditId(q.id); setTitle(q.title); setDescription(q.description || ""); setCoinReward(String(q.coin_reward)); setPassPercentage(String(q.pass_percentage));
    setQuestions(q.questions.map((qq: any) => ({ question: qq.question, options: qq.options, correct_index: qq.correct_index })));
    setOpen(true);
  };

  const updateQuestion = (i: number, patch: Partial<Question>) => setQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const updateOption = (qi: number, oi: number, value: string) => setQuestions((prev) => prev.map((q, idx) => idx === qi ? { ...q, options: q.options.map((o, oidx) => oidx === oi ? value : o) } : q));
  const addOption = (qi: number) => setQuestions((prev) => prev.map((q, idx) => idx === qi ? { ...q, options: [...q.options, ""] } : q));
  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions((prev) => prev.filter((_, idx) => idx !== i));

  const save = () => {
    const reward = Number.parseInt(coinReward, 10);
    const pass = Number.parseInt(passPercentage, 10);
    if (!title.trim() || questions.some((q) => !q.question.trim() || q.options.some((o) => !o.trim()))) {
      toast({ title: "Fill in the quiz title and all question/option fields" });
      return;
    }
    saveMutation.mutate({ id: editId || undefined, title, description: description || null, is_active: true, coin_reward: reward, pass_percentage: pass, questions });
  };

  if (isLoading) return <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew} className="gap-1.5 text-[13px]"><Plus className="w-3.5 h-3.5" /> New Quiz</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit Quiz" : "New Quiz"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-[13px]" /></div>
                <div><Label className="text-[12px]">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-[13px]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Coin Reward (on pass)</Label><Input type="number" value={coinReward} onChange={(e) => setCoinReward(e.target.value)} className="h-9 text-[13px]" /></div>
                <div><Label className="text-[12px]">Pass Percentage</Label><Input type="number" value={passPercentage} onChange={(e) => setPassPercentage(e.target.value)} className="h-9 text-[13px]" /></div>
              </div>

              <div className="space-y-3">
                <Label className="text-[12px]">Questions</Label>
                {questions.map((q, qi) => (
                  <Card key={qi} className="border-border/20 bg-secondary/10">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={q.question} onChange={(e) => updateQuestion(qi, { question: e.target.value })} placeholder={`Question ${qi + 1}`} className="h-9 text-[13px] flex-1" />
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeQuestion(qi)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2 pl-4">
                          <input type="radio" checked={q.correct_index === oi} onChange={() => updateQuestion(qi, { correct_index: oi })} />
                          <Input value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`} className="h-8 text-[12px]" />
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addOption(qi)} className="text-[11px] h-7 ml-4">+ Add option</Button>
                    </CardContent>
                  </Card>
                ))}
                <Button size="sm" variant="outline" onClick={addQuestion} className="gap-1.5 text-[12px]"><Plus className="w-3.5 h-3.5" /> Add Question</Button>
              </div>

              <Button onClick={save} disabled={saveMutation.isPending} className="w-full">{saveMutation.isPending ? "Saving..." : "Save Quiz"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {quizzes.map((q: any) => (
          <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 bg-secondary/10">
            <HelpCircle className={`w-5 h-5 shrink-0 ${q.is_active ? "text-primary" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{q.title}</span>
                <Badge variant="outline" className="text-[10px]">{q.questions.length} Q</Badge>
                <Badge variant="outline" className="text-[10px]">{q._count.attempts} attempts</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Reward: {q.coin_reward} coins · Pass: {q.pass_percentage}%</p>
            </div>
            <Switch checked={q.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: q.id, is_active: v })} />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(q)}><Edit className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Delete this quiz?")) deleteMutation.mutate({ id: q.id }); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
          </div>
        ))}
        {quizzes.length === 0 && <p className="text-center text-muted-foreground text-[13px] py-6">No quizzes yet.</p>}
      </div>
    </div>
  );
}
