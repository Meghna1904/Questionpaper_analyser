# QP Extractor — Task List

## Backend
- [/] `backend/parser.py` — PDF extractor (dual-mode: PyMuPDF + OCR fallback)
- [ ] `backend/syllabus_parser.py` — Syllabus → module/topic map
- [ ] `backend/analyser.py` — Hybrid SBERT + keyword topic matcher (multi-label)
- [ ] `backend/predictor.py` — Prediction engine (frequency × recency × consistency)
- [ ] `backend/app.py` — Flask API
- [ ] `backend/requirements.txt`

## Frontend
- [ ] Init React + Vite project
- [ ] `UploadPage.jsx` — drag-and-drop PDFs + syllabus input
- [ ] `ResultsPage.jsx` — analysis dashboard
- [ ] `ModuleTabs.jsx`
- [ ] `TopicTable.jsx` — ranked topics with freq badges
- [ ] `FrequencyChart.jsx` — Recharts bar graph
- [ ] `QuestionCard.jsx` — question + multi-topic confidence bars
- [ ] `PredictionPanel.jsx`
- [ ] CSS design system

## Testing
- [ ] Connect frontend to backend
- [ ] Upload 3 sample PDFs + syllabus → verify analysis
- [ ] Check multi-topic mapping accuracy
- [ ] Verify prediction scores
