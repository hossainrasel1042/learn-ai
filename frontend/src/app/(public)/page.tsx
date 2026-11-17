"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Search,
  MessageSquare,
  Users,
  Database,
  Sparkles,
  Zap,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const floaty: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      
      <motion.section
        initial="hidden"
        animate="show"
        variants={stagger}
        className="relative overflow-hidden pt-16 md:pt-24 lg:pt-32 pb-16"
      >
        <div className="container px-4 md:px-6 mx-auto">
          <div className="flex flex-col items-center text-center space-y-8">
            <motion.div variants={fadeUp}>
              <Badge
                variant="secondary"
                className="px-4 py-2 text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                ✨ AI-Powered Learning Platform
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-primary via-fuchsia-500 to-indigo-500"
            >
              Master Your Coursework <br className="hidden md:inline" />
              with Intelligent Tools
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="max-w-[800px] text-lg md:text-xl text-muted-foreground leading-relaxed"
            >
              LearnAI transforms fragmented course materials into an organized, interactive knowledge base.
              Search notes, digitize handwriting, and get instant answers powered by AI.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row gap-4 w-full justify-center pt-4"
            >
              <Link href="/materials">
                <Button
                  size="lg"
                  className="w-full sm:w-auto text-lg h-12 px-8 gap-2 shadow-lg shadow-primary/25"
                >
                  Explore your Course Materials <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto text-lg h-12 px-8"
                >
                  Try the Assistant
                </Button>
              </Link>
            </motion.div>

            
            <motion.div
              variants={floaty}
              whileHover={{ scale: 1.01 }}
              className="w-full max-w-5xl mt-16 p-4 bg-muted/30 rounded-xl border border-border/50 shadow-2xl backdrop-blur-sm"
            >
              <div className="aspect-[16/9] w-full bg-background rounded-lg border border-border overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-fuchsia-500/5"></div>

                
                <div className="absolute top-0 left-0 right-0 h-14 border-b border-border bg-card/50 flex items-center px-6 gap-2">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
                  </div>
                </div>

                <div className="absolute top-20 left-10 right-10 bottom-10 grid grid-cols-12 gap-6">
                  <div className="col-span-3 bg-muted/50 rounded-lg hidden md:flex flex-col p-4 gap-3">
                    <div className="h-4 w-20 bg-primary/20 rounded-md mb-2"></div>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-8 w-full bg-background/50 rounded-md flex items-center px-3 gap-2"
                      >
                        <div className="w-4 h-4 rounded-full bg-muted-foreground/20"></div>
                        <div className="h-2 w-16 bg-muted-foreground/20 rounded-full"></div>
                      </div>
                    ))}
                  </div>
                  <div className="col-span-12 md:col-span-9 bg-card rounded-lg border border-border shadow-sm p-6 flex flex-col gap-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="h-8 w-1/3 bg-primary/10 rounded-md flex items-center px-4">
                        <span className="text-sm font-medium text-primary/70">
                          Course Overview
                        </span>
                      </div>
                      <div className="h-8 w-24 bg-muted rounded-md"></div>
                    </div>

                    <div className="space-y-3">
                      <div className="h-16 w-full bg-muted/30 rounded-md border border-border/50 p-3 flex gap-3 items-center">
                        <div className="w-10 h-10 rounded bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/4 bg-muted-foreground/10 rounded"></div>
                          <div className="h-3 w-1/2 bg-muted-foreground/10 rounded"></div>
                        </div>
                      </div>
                      <div className="h-16 w-full bg-muted/30 rounded-md border border-border/50 p-3 flex gap-3 items-center">
                        <div className="w-10 h-10 rounded bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-500">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/3 bg-muted-foreground/10 rounded"></div>
                          <div className="h-3 w-2/3 bg-muted-foreground/10 rounded"></div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto flex gap-3">
                      <div className="h-10 w-full bg-muted/50 rounded-md flex items-center px-4 text-sm text-muted-foreground">
                        Ask a question about your courses...
                      </div>
                      <div className="h-10 w-12 bg-primary rounded-md flex items-center justify-center text-primary-foreground">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      
      <section className="py-24 bg-muted/30">
        <div className="container px-4 md:px-6 mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger}
            className="text-center mb-16 space-y-4"
          >
            <motion.h2
              variants={fadeUp}
              className="text-3xl md:text-4xl font-bold"
            >
              Everything You Need to Excel
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-lg text-muted-foreground max-w-2xl mx-auto"
            >
              A complete suite of tools designed to help university students learn
              faster and more effectively.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.1 }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <FeatureCard
              icon={<Search className="w-6 h-6 text-indigo-500" />}
              title="Intelligent Search"
              description="Find exactly what you need across slides, PDFs, and code files using semantic RAG capability."
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6 text-fuchsia-500" />}
              title="AI Assistant"
              description="Chat with an AI that understands your specific course context and materials."
            />
            <FeatureCard
              icon={<Users className="w-6 h-6 text-amber-500" />}
              title="Community Support"
              description="Discuss problems with peers and get automated help when no one is around."
            />
            <FeatureCard
              icon={<Database className="w-6 h-6 text-rose-500" />}
              title="Content Management"
              description="Organized repository for all your theory and lab materials, categorized and searchable."
            />
            <FeatureCard
              icon={<BookOpen className="w-6 h-6 text-sky-500" />}
              title="Study Materials"
              description="Generate summaries, flashcards, and practice questions from your upload content."
            />
          </motion.div>
        </div>
      </section>

      
      <section className="py-24">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              variants={stagger}
              className="space-y-8"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl md:text-4xl font-bold leading-tight"
              >
                Streamline Your Study Workflow
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="text-lg text-muted-foreground"
              >
                Stop wasting time searching through fragmented files. LearnAI
                brings everything together.
              </motion.p>

              <motion.div variants={stagger} className="space-y-6">
                <Step
                  number="1"
                  title="Upload Materials"
                  description="Upload your lecture slides, PDFs, lab codes, and handwritten notes."
                />
                <Step
                  number="2"
                  title="AI Analysis"
                  description="Our system processes, indexes, and understands your content automatically."
                />
                <Step
                  number="3"
                  title="Learn & Interact"
                  description="Query the knowledge base, generate summaries, and collaborate with peers."
                />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-primary to-fuchsia-500 rounded-2xl opacity-10 blur-2xl"></div>
              <Card className="relative h-[500px] border-border shadow-xl overflow-hidden flex flex-col">
                <div className="p-6 border-b bg-muted/40 flex items-center justify-between">
                  <span className="font-semibold">LearnAI Assistant</span>
                  <Badge variant="outline" className="bg-background">
                    Online
                  </Badge>
                </div>
                <div className="flex-1 p-6 space-y-6 overflow-hidden">
                  
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      AI
                    </div>
                    <div className="p-3 bg-muted rounded-lg rounded-tl-none max-w-[80%] text-sm">
                      Hello! I&apos;m ready to help with your course materials. What
                      are you working on today?
                    </div>
                  </div>

                  <div className="flex gap-3 flex-row-reverse">
                    <div className="w-8 h-8 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900 flex items-center justify-center text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300">
                      U
                    </div>
                    <div className="p-3 bg-primary text-primary-foreground rounded-lg rounded-tr-none max-w-[80%] text-sm">
                      Can you explain the difference between BFS and DFS based on
                      the lecture slides?
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      AI
                    </div>
                    <div className="p-3 bg-muted rounded-lg rounded-tl-none max-w-[80%] text-sm space-y-2">
                      <p>
                        According to <strong>Lecture 3: Graph Algorithms</strong>:
                      </p>
                      <p>
                        <strong>BFS (Breadth-First Search)</strong> explores
                        neighbors level by level using a Queue.
                      </p>
                      <p>
                        <strong>DFS (Depth-First Search)</strong> explores as far
                        as possible along each branch before backtracking using a
                        Stack.
                      </p>
                      <div className="pt-2 flex gap-2">
                        <Badge
                          variant="outline"
                          className="text-xs border-primary/30 bg-primary/5"
                        >
                          Source: slide_03.pdf (p.14)
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t bg-muted/20">
                  <div className="h-10 bg-background border rounded-md w-full animate-pulse"></div>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="py-24 bg-gradient-to-br from-primary to-indigo-600 text-primary-foreground"
      >
        <div className="container px-4 md:px-6 mx-auto text-center space-y-8">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Ready to Upgrade Your Learning?
          </h2>
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto">
            Join the platform that helps you study smarter, not harder.
          </p>
          <Link href="/dashboard">
            <Button
              variant="secondary"
              size="lg"
              className="h-14 px-8 text-lg font-semibold shadow-xl"
            >
              Get Started Now <Zap className="w-5 h-5 ml-2 fill-current" />
            </Button>
          </Link>
        </div>
      </motion.section>

      
      <footer className="py-12 border-t bg-muted/10">
        <div className="container px-4 md:px-6 mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-xl">
            <span>LearnAI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 LearnAI. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -4 }}>
      <Card className="border-border/50 hover:border-primary/50 transition-colors shadow-sm hover:shadow-md">
        <CardHeader>
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-2">
            {icon}
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <motion.div variants={fadeUp} className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20">
        {number}
      </div>
      <div>
        <h3 className="text-xl font-bold mb-1">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
}
