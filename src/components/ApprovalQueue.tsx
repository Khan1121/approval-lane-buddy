import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, User, Building2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ApprovalRequest {
  id: string;
  title: string;
  content: string;
  department: string;
  status: string;
  queue_position: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  profiles: {
    name: string;
  } | null;
}

interface ApprovalQueueProps {
  refreshTrigger: number;
}

const ApprovalQueue: React.FC<ApprovalQueueProps> = ({ refreshTrigger }) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      // First get approval requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('approval_requests')
        .select('*')
        .order('queue_position', { ascending: true });

      if (requestsError) {
        console.error('Error fetching requests:', requestsError);
        return;
      }

      // Then get profiles for each request
      const requestsWithProfiles = await Promise.all(
        (requestsData || []).map(async (request) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', request.user_id)
            .single();

          return {
            ...request,
            profiles: profileData
          };
        })
      );

      setRequests(requestsWithProfiles);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [refreshTrigger]);

  useEffect(() => {
    // Set up real-time subscription
    const channel = supabase
      .channel('approval_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_requests'
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprovalAction = async (requestId: string, action: 'approved' | 'rejected') => {
    if (!user || !profile || (profile.role !== 'approver' && profile.role !== 'admin')) {
      toast({
        variant: "destructive",
        title: "권한 없음",
        description: "결재 처리 권한이 없습니다.",
      });
      return;
    }

    setProcessingId(requestId);

    try {
      // Update the approval request status
      const { error: updateError } = await supabase
        .from('approval_requests')
        .update({ status: action })
        .eq('id', requestId);

      if (updateError) {
        throw updateError;
      }

      // Insert approval action record
      const { error: actionError } = await supabase
        .from('approval_actions')
        .insert({
          request_id: requestId,
          approver_id: user.id,
          action: action,
          comment: `${action === 'approved' ? '승인' : '반려'} 처리됨`
        });

      if (actionError) {
        throw actionError;
      }

      toast({
        title: `결재 ${action === 'approved' ? '승인' : '반려'}`,
        description: `결재가 성공적으로 ${action === 'approved' ? '승인' : '반려'}되었습니다.`,
      });

      fetchRequests();
    } catch (error) {
      console.error('Error processing approval:', error);
      toast({
        variant: "destructive",
        title: "처리 실패",
        description: "결재 처리 중 오류가 발생했습니다.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">대기중</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">승인</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">반려</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isMyRequest = (request: ApprovalRequest) => {
    return user && request.profiles && request.profiles.name === profile?.name;
  };

  const canApprove = profile?.role === 'approver' || profile?.role === 'admin';

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            대기열
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">로딩 중...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingRequests = requests.filter(req => req.status === 'pending');
  const completedRequests = requests.filter(req => req.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            대기열 ({pendingRequests.length}명)
          </CardTitle>
          <CardDescription>
            현재 결재 대기 중인 요청들입니다. 
            {canApprove && " 결재자는 승인/반려 처리가 가능합니다."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingRequests.length === 0 ? (
            <Alert>
              <AlertDescription>현재 대기 중인 결재가 없습니다.</AlertDescription>
            </Alert>
          ) : (
            pendingRequests.map((request, index) => (
              <Card 
                key={request.id} 
                className={`${isMyRequest(request) ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {request.queue_position || index + 1}번째
                        </Badge>
                        {getStatusBadge(request.status)}
                        {isMyRequest(request) && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            내 신청
                          </Badge>
                        )}
                      </div>
                      
                      <h4 className="font-semibold text-lg mb-1">{request.title}</h4>
                      {request.content && (
                        <p className="text-muted-foreground text-sm mb-3">{request.content}</p>
                      )}
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {request.profiles?.name}
                        </div>
                        <div className="flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          {request.department}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDistanceToNow(new Date(request.created_at), { 
                            addSuffix: true, 
                            locale: ko 
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {canApprove && request.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprovalAction(request.id, 'approved')}
                          disabled={processingId === request.id}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {processingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleApprovalAction(request.id, 'rejected')}
                          disabled={processingId === request.id}
                        >
                          {processingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          반려
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Completed Requests */}
      {completedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>최근 처리된 결재</CardTitle>
            <CardDescription>
              최근에 승인/반려된 결재 요청들입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedRequests.slice(0, 5).map((request) => (
              <div 
                key={request.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <h5 className="font-medium">{request.title}</h5>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>{request.profiles?.name}</span>
                    <span>{request.department}</span>
                    <span>
                      {formatDistanceToNow(new Date(request.updated_at), { 
                        addSuffix: true, 
                        locale: ko 
                      })}
                    </span>
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ApprovalQueue;