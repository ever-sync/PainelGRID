import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Play,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { readStoredSession } from "../../services/auth";
import {
  getCourse,
  listCourses,
  mapApiCourseToCourse,
  myCourseProgress,
  patchLessonProgress,
  type ApiProgressRow,
} from "../../services/coursesApi";
import type { Course, User } from "../../types";
type OutletContext = {
  user: User;
};

export function CursosVendedorPage() {
  const { user } = useOutletContext<OutletContext>();

  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<ApiProgressRow[]>([]);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Course>>({});

  const load = useCallback(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    void Promise.all([listCourses(token), myCourseProgress(token)]).then(
      ([rows, prog]) => {
        setCourses(rows.map(mapApiCourseToCourse));
        setProgress(prog);
      },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!expandedCourse || !token || details[expandedCourse]) return;
    void getCourse(expandedCourse, token).then((row) => {
      setDetails((d) => ({
        ...d,
        [expandedCourse]: mapApiCourseToCourse(row),
      }));
    });
  }, [expandedCourse, details]);

  const completedLessonIds = new Set(
    progress.filter((p) => p.completed).map((p) => p.lesson_id),
  );

  const coursesWithProgress = courses.map((course) => {
    const courseProg = progress.filter((p) => p.course_id === course.id);
    const completed = courseProg.filter((p) => p.completed).length;
    const total = course.total_lessons || 1;
    const pct = Math.round((completed / total) * 100);
    const last = courseProg.reduce((a, b) => {
      const t = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return t > a ? t : a;
    }, 0);
    return {
      ...course,
      completed,
      pct,
      lastAccess: last ? new Date(last).toISOString() : undefined,
    };
  });

  async function toggleLesson(
    courseId: string,
    lessonId: string,
    currentlyDone: boolean,
  ) {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    try {
      await patchLessonProgress(courseId, lessonId, !currentlyDone, token);
      load();
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <PageHeader
        title="Meus Cursos"
        breadcrumbs={[{ label: "Vendedor" }, { label: "Cursos" }]}
        subtitle={user.name}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {coursesWithProgress.map((course) => {
          const full = details[course.id] ?? course;
          return (
            <div key={course.id}>
              <Card padding="none" className="overflow-hidden">
                <div className="h-24 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <BookOpen size={40} className="text-white/80" />
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">
                    {course.title}
                  </h3>
                  <p className="text-xs text-gray-400 mb-3 line-clamp-2">
                    {course.description}
                  </p>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {course.completed}/{course.total_lessons} aulas
                        concluídas
                      </span>
                      <span className="font-semibold">{course.pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all bg-gradient-to-r from-blue-400 to-indigo-500"
                        style={{ width: `${course.pct}%` }}
                      />
                    </div>
                  </div>

                  {course.lastAccess && (
                    <p className="text-xs text-gray-400 mb-3">
                      Último acesso:{" "}
                      {new Date(course.lastAccess).toLocaleDateString("pt-BR")}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCourse(
                        expandedCourse === course.id ? null : course.id,
                      )
                    }
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    {expandedCourse === course.id ? (
                      <>
                        <ChevronDown size={15} />
                        Ocultar Aulas
                      </>
                    ) : (
                      <>
                        <ChevronRight size={15} />
                        Ver Aulas
                      </>
                    )}
                  </button>
                </div>

                {expandedCourse === course.id && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    <div className="space-y-1 pt-3">
                      {full.lessons.map((lesson, i) => {
                        const isDone = completedLessonIds.has(lesson.id);
                        return (
                          <div
                            key={lesson.id}
                            className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 group"
                          >
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-3 text-left"
                              onClick={() =>
                                void toggleLesson(course.id, lesson.id, isDone)
                              }
                            >
                              {isDone ? (
                                <CheckCircle2
                                  size={15}
                                  className="text-green-500 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0" />
                              )}
                              <span
                                className={`text-xs ${isDone ? "text-gray-400 line-through" : "text-gray-700"}`}
                              >
                                {i + 1}. {lesson.title}
                              </span>
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                {lesson.duration_min} min
                              </span>
                              <span className="p-1 text-blue-500 opacity-0 group-hover:opacity-100">
                                <Play size={12} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
