import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface ApprovalRequestFormProps {
  onSuccess: () => void;
}

const ApprovalRequestForm: React.FC<ApprovalRequestFormProps> = ({ onSuccess }) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    setLoading(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('approval_requests')
        .insert({
          user_id: user.id,
          title,
          content,
          department: profile.department,
          status: 'pending'
        });

      if (insertError) {
        setError(insertError.message);
        toast({
          variant: "destructive",
          title: "신청 실패",
          description: insertError.message,
        });
      } else {
        toast({
          title: "결재 신청 완료",
          description: "결재 신청이 성공적으로 등록되었습니다.",
        });
        
        // Reset form
        setTitle('');
        setContent('');
        setOpen(false);
        onSuccess();
      }
    } catch (err) {
      setError('결재 신청 중 오류가 발생했습니다.');
      toast({
        variant: "destructive",
        title: "오류",
        description: "결재 신청 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          결재 신청
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>새 결재 신청</DialogTitle>
          <DialogDescription>
            결재가 필요한 내용을 작성해주세요. 신청 후 대기열에 등록됩니다.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="결재 제목을 입력하세요"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="content">내용</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="결재 내용을 상세히 작성해주세요"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <Label className="text-xs">신청자</Label>
              <p>{profile?.name}</p>
            </div>
            <div>
              <Label className="text-xs">부서</Label>
              <p>{profile?.department}</p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end space-x-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              신청하기
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ApprovalRequestForm;