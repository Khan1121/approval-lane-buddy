import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogOut, User, Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ApprovalRequestForm from '@/components/ApprovalRequestForm';
import ApprovalQueue from '@/components/ApprovalQueue';

const Index = () => {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleRequestSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">결재 신청 시스템</h1>
              <p className="text-sm text-muted-foreground">온라인 결재 신청 및 대기열 관리</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-medium">{profile.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{profile.department}</span>
                  {(profile.role === 'approver' || profile.role === 'admin') && (
                    <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs">
                      결재자
                    </span>
                  )}
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={signOut}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Actions */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>빠른 작업</CardTitle>
                <CardDescription>
                  결재 신청 및 기타 작업을 수행할 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ApprovalRequestForm onSuccess={handleRequestSuccess} />
                
                <Alert>
                  <AlertDescription className="text-sm">
                    💡 <strong>팁:</strong> 결재 신청 후 대기열에서 순번을 확인하세요. 
                    결재자가 승인/반려 처리하면 실시간으로 업데이트됩니다.
                  </AlertDescription>
                </Alert>

                {(profile.role === 'approver' || profile.role === 'admin') && (
                  <Alert>
                    <AlertDescription className="text-sm">
                      👨‍💼 <strong>결재자 권한:</strong> 대기열에서 승인/반려 버튼을 통해 
                      결재를 처리할 수 있습니다.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Queue */}
          <div className="lg:col-span-2">
            <ApprovalQueue refreshTrigger={refreshTrigger} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
