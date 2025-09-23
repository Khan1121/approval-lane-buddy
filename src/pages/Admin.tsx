import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, FileText, Clock, CheckCircle, XCircle, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface AdminStats {
  totalUsers: number;
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
}

interface UserProfile {
  id: string;
  name: string;
  department: string;
  role: string;
  created_at: string;
}

interface ApprovalRequest {
  id: string;
  title: string;
  department: string;
  status: string;
  created_at: string;
  user_id: string;
  profiles: {
    name: string;
  };
}

const Admin: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
  });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // 관리자 권한 확인
  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      navigate('/');
      toast({
        variant: "destructive",
        title: "접근 권한 없음",
        description: "관리자만 접근할 수 있습니다.",
      });
    }
  }, [profile, navigate, toast]);

  // 통계 및 데이터 로드
  useEffect(() => {
    if (profile?.role === 'admin') {
      loadAdminData();
    }
  }, [profile]);

  const loadAdminData = async () => {
    try {
      setLoading(true);

      // 사용자 통계
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // 결재 요청 데이터 가져오기
      const { data: requestsData, error: requestsError } = await supabase
        .from('approval_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // 사용자 정보를 별도로 가져와서 매핑
      const requestsWithProfiles = await Promise.all(
        (requestsData || []).map(async (request) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', request.user_id)
            .single();
          
          return {
            ...request,
            profiles: profileData || { name: 'Unknown' }
          };
        })
      );

      setUsers(usersData || []);
      setRequests(requestsWithProfiles || []);

      // 통계 계산
      const totalUsers = usersData?.length || 0;
      const totalRequests = requestsWithProfiles?.length || 0;
      const pendingRequests = requestsWithProfiles?.filter(r => r.status === 'pending').length || 0;
      const approvedRequests = requestsWithProfiles?.filter(r => r.status === 'approved').length || 0;
      const rejectedRequests = requestsWithProfiles?.filter(r => r.status === 'rejected').length || 0;

      setStats({
        totalUsers,
        totalRequests,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
      toast({
        variant: "destructive",
        title: "데이터 로드 실패",
        description: "관리자 데이터를 불러오는 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "역할 변경 완료",
        description: "사용자 역할이 성공적으로 변경되었습니다.",
      });

      loadAdminData(); // 데이터 새로고침
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        variant: "destructive",
        title: "역할 변경 실패",
        description: "사용자 역할 변경 중 오류가 발생했습니다.",
      });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'approver': return 'default';
      default: return 'secondary';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  if (profile?.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>데이터를 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">관리자 대시보드</h1>
          <p className="text-muted-foreground">시스템 전체 현황을 관리하세요</p>
        </div>
        <Badge variant="destructive" className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          관리자
        </Badge>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 사용자</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 요청</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRequests}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">대기 중</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingRequests}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">승인됨</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approvedRequests}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">거부됨</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejectedRequests}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">사용자 관리</TabsTrigger>
          <TabsTrigger value="requests">결재 요청 관리</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>사용자 목록</CardTitle>
              <CardDescription>
                모든 사용자의 정보와 역할을 관리할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>가입일</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.department}</TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role === 'admin' ? '관리자' : 
                           user.role === 'approver' ? '승인자' : '직원'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(newRole) => updateUserRole(user.id, newRole)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">직원</SelectItem>
                            <SelectItem value="approver">승인자</SelectItem>
                            <SelectItem value="admin">관리자</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>결재 요청 목록</CardTitle>
              <CardDescription>
                모든 결재 요청의 현황을 확인할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제목</TableHead>
                    <TableHead>신청자</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>신청일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.title}</TableCell>
                      <TableCell>{request.profiles?.name}</TableCell>
                      <TableCell>{request.department}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(request.status)}>
                          {request.status === 'pending' ? '대기 중' :
                           request.status === 'approved' ? '승인됨' : '거부됨'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(request.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;