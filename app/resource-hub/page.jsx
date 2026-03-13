'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookText, FileQuestion, Upload, ArrowRight, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { ContributeModal } from '@/components/resource-hub/ContributeModal'

export default function ResourceHubPage() {
  const router = useRouter()
  const [isContributeOpen, setIsContributeOpen] = useState(false)

  const categories = [
    {
      title: 'Reference Notes',
      description: 'Comprehensive study materials, distilled summaries, and shared learning notes.',
      icon: <BookText className="h-8 w-8 text-primary" />,
      link: '/resource-hub/notes',
      color: 'bg-primary/10',
      borderColor: 'border-primary/20',
      actionText: 'Explore',
      actionColor: 'text-primary'
    },
    {
      title: 'PYQ (Previous Year Questions)',
      description: 'Practice with real examination questions from previous years to test your mastery.',
      icon: <FileQuestion className="h-8 w-8 text-orange-500" />,
      link: '/resource-hub/pyq',
      color: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      actionText: 'Explore',
      actionColor: 'text-primary'
    },
    {
      title: 'Contribute Materials',
      description: 'Share your study notes or previous year questions with the community and help others learn.',
      icon: <Upload className="h-8 w-8 text-emerald-500" />,
      link: null,
      color: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      actionText: 'Contribute',
      actionColor: 'text-emerald-500'
    }
  ]

  return (
    <div className="relative overflow-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider mb-4 w-fit">
            <Sparkles className="h-3 w-3" />
            <span>Learning Resources</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Resource Hub</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Access curated study materials and practice questions to enhance your learning journey.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {categories.map((category, index) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card
                className={`glass-card h-full hover:bg-white/5 transition-all cursor-pointer group border-white/5 hover:${category.borderColor}`}
                onClick={() => {
                  if (category.link) {
                    router.push(category.link)
                  } else {
                    setIsContributeOpen(true)
                  }
                }}
              >
                <CardHeader>
                  <div className={`p-4 ${category.color} rounded-2xl w-fit mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {category.icon}
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight group-hover:text-primary transition-colors">
                    {category.title}
                  </CardTitle>
                  <CardDescription className="text-lg leading-relaxed">
                    {category.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`flex items-center ${category.actionColor} font-semibold uppercase tracking-wider text-sm mt-4`}>
                    {category.actionText} <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <ContributeModal
        isOpen={isContributeOpen}
        onClose={() => setIsContributeOpen(false)}
      />
    </div>
  )
}
