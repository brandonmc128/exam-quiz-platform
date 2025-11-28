# Exam Quiz Platform

A full-stack web application for practicing exam questions with persistent progress tracking. Built with React, Flask, and MariaDB/MySQL.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)

## Features

- 📚 **Multi-test bank management** - Organize questions by topic/exam
- 🎯 **Smart practice modes** - Study all questions, random order, or only wrong answers
- 📊 **Persistent progress tracking** - All statistics stored in database
- 🔄 **Wrong answer filtering** - Practice questions you've gotten wrong X times
- 📈 **Detailed statistics** - Track your performance over time
- 🖼️ **Image support** - Questions can include images
- ✅ **Multiple answer support** - Handles both single and multiple correct answers
- 🎨 **Modern UI** - Clean, responsive interface with Tailwind CSS

## Screenshots

### Quiz Interface
Select answers and reveal results with instant feedback.

### Statistics Dashboard
Track your progress with detailed analytics and charts.

## Table of Contents

- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Local Setup](#local-setup)
  - [Docker Setup](#docker-setup)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Web Scraper](#web-scraper)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Prerequisites

- **Python 3.11+**
- **Node.js 20+**
- **MariaDB 11+ or MySQL 8+**
- **npm or yarn**

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/exam-quiz-platform.git
   cd exam-quiz-platform
   ```

2. **Set up the database**
   ```bash
   # Start MariaDB/MySQL
   mysql -u root -p
   
   # Run the setup commands
   CREATE DATABASE exam_questions CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'exam_user'@'localhost' IDENTIFIED BY 'your_secure_password';
   GRANT ALL PRIVILEGES ON exam_questions.* TO 'exam_user'@'localhost';
   FLUSH PRIVILEGES;
   exit;
   ```

3. **Set up the backend**
   ```bash
   cd backend
   
   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Update database credentials in app.py
   # Edit DB_CONFIG section with your password
   
   # Run the backend
   python app.py
   ```
   
   The backend will start on `http://localhost:5000`

4. **Set up the frontend**
   ```bash
   cd frontend
   
   # Install dependencies
   npm install
   
   # Run the development server
   npm run dev
   ```
   
   The frontend will start on `http://localhost:3000`

5. **Populate the database**
   ```bash
   cd scraper
   
   # Update the database config in the scraper script
   # Then run it to populate questions
   python scrape_questions.py
   ```

6. **Access the application**
   
   Open your browser and navigate to `http://localhost:3000`

### Docker Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/exam-quiz-platform.git
   cd exam-quiz-platform
   ```

2. **Update credentials**
   
   Edit `docker-compose.yml` and change the default passwords:
   ```yaml
   MYSQL_ROOT_PASSWORD: your_root_password
   MYSQL_PASSWORD: your_secure_password
   ```

3. **Build and start containers**
   ```bash
   docker-compose up -d --build
   ```

4. **Populate the database**
   ```bash
   # Run your scraper to populate questions
   python scraper/scrape_questions.py
   ```

5. **Access the application**
   
   Open your browser and navigate to `http://localhost:3000`

6. **View logs**
   ```bash
   docker-compose logs -f
   ```

7. **Stop containers**
   ```bash
   docker-compose down
   ```

## Usage

### Taking a Quiz

1. **Select a test bank** from the dropdown
2. **Configure quiz settings:**
   - Set question range (start/end)
   - Enable random order (optional)
   - Filter by wrong answers (optional)
3. **Click "Start Quiz"**
4. **Select your answer(s)** by clicking
5. **Click "Reveal Answer"** to check if you're correct
6. **Navigate** using Previous/Next buttons

### Practice Modes

- **All Questions**: Practice the full question set
- **Random Order**: Shuffle questions for varied practice
- **Wrong Answers Only**: Focus on questions you've missed
- **Wrong X Times**: Target your most challenging questions

### Viewing Statistics

Click the **"Statistics"** button to view:
- Current session performance
- Historical accuracy by question
- Overall progress charts
- Detailed results breakdown

### Resetting Progress

- **Reset Quiz**: Clear current session answers
- **Reset Stats** (per bank): Delete progress for one test bank
- **Reset All Stats**: Clear all progress across all banks

## Project Structure

```
exam-quiz-platform/
├── backend/
│   ├── app.py                 # Flask API server
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile            # Backend Docker config
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main React component
│   │   ├── index.jsx         # React entry point
│   │   └── index.css         # Global styles
│   ├── package.json          # Node dependencies
│   ├── vite.config.js        # Vite configuration
│   ├── tailwind.config.js    # Tailwind CSS config
│   ├── Dockerfile            # Frontend Docker config
│   └── nginx.conf            # Nginx configuration
│
├── scraper/
│   └── scrape_questions.py   # Web scraper for questions
│
├── docker-compose.yml        # Docker Compose config
├── .gitignore
├── .dockerignore
└── README.md
```

## Web Scraper

The included web scraper can extract questions from websites with similar HTML structure.

### Usage

```python
from scrape_questions import scrape_exam_questions

db_config = {
    "host": "localhost",
    "user": "exam_user",
    "password": "your_password",
    "database": "exam_questions"
}

# Scrape questions
scrape_exam_questions(
    base_url="https://example.com/exam/page-{page}",
    topic_name="AWS SAA-C03",
    start_page=1,
    end_page=152,
    db_config=db_config,
    download_images=True
)
```

### Features

- Extracts questions, multiple choice answers, and correct answers
- Supports multiple correct answers per question
- Downloads and stores images (URL or base64)
- Creates separate tables for each topic
- Handles nested HTML structures

## API Documentation

### Endpoints

#### Test Banks

- `GET /api/test-banks` - Get all available test banks
- `GET /api/stats/<table_name>` - Get statistics for a test bank

#### Questions

- `GET /api/questions/<table_name>?start=1&end=10&random=false` - Get questions
- `GET /api/question/<table_name>/<id>` - Get single question
- `GET /api/search/<table_name>?q=keyword` - Search questions

#### User Statistics

- `GET /api/user-stats/<table_name>?user_id=default_user` - Get user stats
- `POST /api/user-stats/<table_name>/<question_id>` - Update stats
- `DELETE /api/user-stats?user_id=default_user` - Reset all stats
- `DELETE /api/user-stats/<table_name>?user_id=default_user` - Reset bank stats

#### Health Check

- `GET /api/health` - Check API status

### Example Request

```bash
curl http://localhost:5000/api/questions/aws_saa_c03?start=1&end=5
```

### Example Response

```json
[
  {
    "id": 1,
    "topic_name": "AWS SAA-C03",
    "question_text": "Which AWS service...?",
    "answer_a": "EC2",
    "answer_b": "S3",
    "answer_c": "Lambda",
    "answer_d": "RDS",
    "correct_answers": "B",
    "question_image_url": null
  }
]
```

## Configuration

### Backend Configuration

Edit `backend/app.py`:

```python
DB_CONFIG = {
    'host': 'localhost',
    'user': 'exam_user',
    'password': 'your_password',
    'database': 'exam_questions'
}
```

### Frontend Configuration

Edit `frontend/src/App.jsx`:

```javascript
const API_BASE_URL = 'http://localhost:5000/api';
```

For Docker, use:
```javascript
const API_BASE_URL = '/api';
```

### Docker Configuration

Edit `docker-compose.yml` to change:
- Database passwords
- Port mappings
- Volume locations

## Troubleshooting

### Backend won't start

**Error: Can't connect to MySQL server**
```bash
# Check if MySQL/MariaDB is running
sudo systemctl status mariadb

# Start the service
sudo systemctl start mariadb
```

**Error: Access denied for user**
```bash
# Verify database credentials
mysql -u exam_user -p
# Enter password and see if you can connect
```

### Frontend won't connect to API

**CORS errors**
- Ensure Flask-CORS is installed: `pip install flask-cors`
- Check that CORS is enabled in `app.py`

**API calls failing**
- Verify backend is running on port 5000
- Check browser console for error messages
- Test API directly: `curl http://localhost:5000/api/health`

### Docker issues

**Container won't start**
```bash
# Check container logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs database

# Rebuild containers
docker-compose down
docker-compose up -d --build
```

**Database connection fails**
```bash
# Wait for database to be ready (check healthcheck)
docker-compose ps

# Restart backend after database is healthy
docker-compose restart backend
```

### No questions appearing

**Database is empty**
- Run the scraper to populate questions
- Verify tables exist: `SHOW TABLES;`
- Check table has data: `SELECT COUNT(*) FROM your_table;`

### Statistics not saving

**Browser storage issues**
- Statistics are now stored in database, not browser
- Verify `user_stats` table exists
- Check backend logs for errors

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow PEP 8 for Python code
- Use ESLint for JavaScript/React code
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [React](https://reactjs.org/)
- Backend powered by [Flask](https://flask.palletsprojects.com/)
- Database using [MariaDB](https://mariadb.org/)
- Charts by [Recharts](https://recharts.org/)
- Icons from [Lucide](https://lucide.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)

## Support

If you encounter any issues or have questions:

1. Search existing [GitHub Issues](https://github.com/brandonmc128/exam-quiz-platform/issues)
2. Create a new issue with detailed information

## Roadmap

- [ ] Multi-user support with authentication
- [ ] Export/import question banks
- [ ] Timed quiz mode
- [ ] Mobile app (React Native)
- [ ] Question bookmarking
- [ ] Study streak tracking
- [ ] Spaced repetition algorithm
- [ ] Community-shared question banks

---

Made by Brandon - (https://github.com/brandonmc128)
