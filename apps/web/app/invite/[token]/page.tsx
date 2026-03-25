'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { acceptInvite } from '../../onboarding/_actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

export default function InvitePage() {
    const params = useParams()
    const router = useRouter()
    const token = params.token as string
    
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [error, setError] = useState<string>('')

    useEffect(() => {
        if (!token) return

        const handleAccept = async () => {
            try {
                const res = await acceptInvite(token)
                if (res.error) {
                    setStatus('error')
                    setError(res.error)
                    toast.error(res.error)
                } else {
                    setStatus('success')
                    toast.success("Welcome to the team!")
                    setTimeout(() => {
                        router.push('/dashboard')
                    }, 2000)
                }
            } catch (err: any) {
                setStatus('error')
                setError(err.message || 'An unexpected error occurred')
            }
        }

        handleAccept()
    }, [token, router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4 font-sans overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

            <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-xl text-zinc-100 shadow-2xl animate-in zoom-in-95 duration-500">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center mb-4 border border-blue-500/20">
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-500"
                        >
                            <polyline points="18 15 12 9 6 15"></polyline>
                            <line x1="12" y1="9" x2="12" y2="21"></line>
                        </svg>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-white">
                        Team Invitation
                    </CardTitle>
                    <CardDescription className="text-zinc-500 mt-1">
                        Accepting your invite to FynBack
                    </CardDescription>
                </CardHeader>
                
                <CardContent className="flex flex-col items-center justify-center py-10 space-y-8">
                    {status === 'loading' && (
                        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
                            <div className="relative">
                                <Loader2 className="h-14 w-14 text-blue-600 animate-spin" />
                                <div className="absolute inset-0 h-14 w-14 bg-blue-600/20 blur-xl animate-pulse rounded-full" />
                            </div>
                            <p className="text-zinc-400 font-medium tracking-wide">Securing your access...</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-4 animate-in zoom-in-90 duration-500">
                            <div className="h-16 w-16 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                                <CheckCircle2 className="h-10 w-10 text-green-500" />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-2xl font-bold text-white tracking-tight">Access Granted!</p>
                                <p className="text-zinc-500">Redirecting to your new dashboard...</p>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-6 animate-in slide-in-from-top-4 duration-500 w-full">
                            <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
                                <XCircle className="h-10 w-10 text-red-500" />
                            </div>
                            <div className="text-center space-y-2 px-4">
                                <p className="text-xl font-bold text-white tracking-tight">Validation Failed</p>
                                <p className="text-red-400/80 leading-relaxed text-sm bg-red-500/5 p-3 rounded-lg border border-red-500/10">{error}</p>
                            </div>
                            <Button 
                                variant="outline" 
                                className="w-full h-11 border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all group"
                                onClick={() => router.push('/sign-in')}
                            >
                                Back to Sign In
                                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
