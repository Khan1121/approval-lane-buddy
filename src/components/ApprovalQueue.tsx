import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, CheckCircle, XCircle, MessageCircle, User, Building, LogOut, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import ApprovalRequestForm from './ApprovalRequestForm';

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

interface ApprovalAction {
  id: string;
  comment: string;
  action: string;
  created_at: string;
  approver_id: string;
  profiles: {
    name: string;
  } | null;
}

const ApprovalQueue: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch approval requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('approval_requests')
        .select('*')
        .order('queue_position', { ascending: true });

      if (requestsError) {
        console.error('Error fetching requests:', requestsError);
        return;
      }

      // Fetch user profiles for requests
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

      // Fetch approval actions
      const { data: actionsData, error: actionsError } = await supabase
        .from('approval_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (actionsError) {
        console.error('Error fetching actions:', actionsError);
        return;
      }

      // Fetch approver profiles for actions
      const actionsWithProfiles = await Promise.all(
        (actionsData || []).map(async (action) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', action.approver_id)
            .single();

          return {
            ...action,
            profiles: profileData
          };
        })
      );

      setRequests(requestsWithProfiles);
      setActions(actionsWithProfiles);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  useEffect(() => {
    // Set up real-time subscription
    const channel = supabase
      .channel('approval_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_requests'
        },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_actions'
        },
        () => {
          fetchData();
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
          comment: comment || `${action === 'approved' ? '승인' : '반려'} 처리됨`
        });

      if (actionError) {
        throw actionError;
      }

      toast({
        title: `결재 ${action === 'approved' ? '승인' : '반려'}`,
        description: `결재가 성공적으로 ${action === 'approved' ? '승인' : '반려'}되었습니다.`,
      });

      setComment('');
      setSelectedRequestId(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error processing approval:', error);
      toast({
        variant: "destructive",
        title: "처리 실패",
        description: "결재 처리 중 오류가 발생했습니다.",
      });
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
    return user && request.user_id === user.id;
  };

  const canApprove = profile?.role === 'approver' || profile?.role === 'admin';

  const pendingRequests = requests.filter(req => req.status === 'pending');
  const completedRequests = requests.filter(req => req.status !== 'pending').slice(0, 5);

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>데이터를 불러오는 중...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span className="font-medium">{profile?.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Building className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">{profile?.department}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {profile?.role === 'admin' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate('/admin')}
                  className="flex items-center space-x-2"
                >
                  <Shield className="h-4 w-4" />
                  <span>관리자</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={signOut}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>로그아웃</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* New Request Form */}
      <ApprovalRequestForm onSuccess={() => setRefreshTrigger(prev => prev + 1)} />

      {/* Pending Requests Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            결재 대기열 ({pendingRequests.length}건)
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
                  <div className="space-y-4">
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
                            <Building className="h-4 w-4" />
                            {request.department}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {format(new Date(request.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </div>
                        </div>
                      </div>
                      
                      {canApprove && request.status === 'pending' && (
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprovalAction(request.id, 'approved')}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleApprovalAction(request.id, 'rejected')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            반려
                          </Button>
                        </div>
                      )}
                    </div>

                    {canApprove && selectedRequestId === request.id && (
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">결재 의견</span>
                        </div>
                        <Textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="결재 의견을 입력하세요 (선택사항)"
                          className="mb-2"
                          rows={2}
                        />
                      </div>
                    )}

                    {canApprove && request.status === 'pending' && selectedRequestId !== request.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRequestId(request.id)}
                        className="w-full"
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        의견 추가
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Recent Actions */}
      {completedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>최근 처리된 결재</CardTitle>
            <CardDescription>
              최근에 승인/반려된 결재 요청들입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedRequests.map((request) => (
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
                      {format(new Date(request.updated_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
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