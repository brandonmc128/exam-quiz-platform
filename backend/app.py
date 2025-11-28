from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'exam_user'),
    'password': os.getenv('DB_PASSWORD', 'your_secure_password_here'),
    'database': os.getenv('DB_NAME', 'exam_questions')
}

def get_db_connection():
    """Create and return a database connection"""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

def init_user_stats_table():
    """Create user_stats table if it doesn't exist"""
    connection = get_db_connection()
    if not connection:
        return False
    
    try:
        cursor = connection.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_stats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) DEFAULT 'default_user',
                table_name VARCHAR(255) NOT NULL,
                question_id INT NOT NULL,
                attempts INT DEFAULT 0,
                correct INT DEFAULT 0,
                last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_question (user_id, table_name, question_id),
                INDEX idx_user_table (user_id, table_name),
                INDEX idx_question (question_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        connection.commit()
        cursor.close()
        connection.close()
        return True
    except Error as e:
        print(f"Error creating user_stats table: {e}")
        return False

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    init_user_stats_table()
    return jsonify({'status': 'healthy', 'message': 'API is running'})

@app.route('/api/test-banks', methods=['GET'])
def get_test_banks():
    """Get all available test banks (tables) from the database"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        
        test_banks = []
        for table in tables:
            table_name = list(table.values())[0]
            
            # Skip the user_stats table
            if table_name == 'user_stats':
                continue
            
            # Get total questions count
            cursor.execute(f"SELECT COUNT(*) as total FROM `{table_name}`")
            count_result = cursor.fetchone()
            total_questions = count_result['total'] if count_result else 0
            
            # Try to get topic_name, but handle if column doesn't exist
            try:
                cursor.execute(f"SELECT topic_name FROM `{table_name}` LIMIT 1")
                topic_result = cursor.fetchone()
                display_name = topic_result['topic_name'] if topic_result and topic_result.get('topic_name') else table_name.replace('_', ' ').title()
            except Error:
                # Column doesn't exist, use table name
                display_name = table_name.replace('_', ' ').title()
            
            test_banks.append({
                'name': table_name,
                'displayName': display_name,
                'totalQuestions': total_questions
            })
        
        cursor.close()
        connection.close()
        
        return jsonify(test_banks)
    
    except Error as e:
        print(f"Error fetching test banks: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/questions/<table_name>', methods=['GET'])
def get_questions(table_name):
    """Get questions from a specific test bank with optional range and randomization"""
    start = int(request.args.get('start', 1))
    end = int(request.args.get('end', 10))
    random_order = request.args.get('random', 'false').lower() == 'true'
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Validate table name to prevent SQL injection
        cursor.execute("SHOW TABLES LIKE %s", (table_name,))
        if not cursor.fetchone():
            return jsonify({'error': 'Test bank not found'}), 404
        
        # Build query with optional random ordering
        order_clause = "ORDER BY RAND()" if random_order else "ORDER BY id"
        
        query = f"""
            SELECT id, topic_name, question_text, question_image_url, question_image_data, 
                   question_image_type, answer_a, answer_b, answer_c, answer_d, answer_e, 
                   answer_f, correct_answers, page_number
            FROM `{table_name}`
            {order_clause}
            LIMIT %s OFFSET %s
        """
        
        cursor.execute(query, (end - start + 1, start - 1))
        questions = cursor.fetchall()
        
        # Convert image data if present
        for question in questions:
            if question['question_image_data']:
                # Image is already base64 encoded in the database
                question['question_image_base64'] = question['question_image_data']
            del question['question_image_data']  # Remove the large data field
        
        cursor.close()
        connection.close()
        
        return jsonify(questions)
    
    except Error as e:
        print(f"Error fetching questions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/question/<table_name>/<int:question_id>', methods=['GET'])
def get_single_question(table_name, question_id):
    """Get a single question by ID"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Validate table name
        cursor.execute("SHOW TABLES LIKE %s", (table_name,))
        if not cursor.fetchone():
            return jsonify({'error': 'Test bank not found'}), 404
        
        query = f"""
            SELECT id, topic_name, question_text, question_image_url, question_image_data,
                   question_image_type, answer_a, answer_b, answer_c, answer_d, answer_e,
                   answer_f, correct_answers, page_number
            FROM `{table_name}`
            WHERE id = %s
        """
        
        cursor.execute(query, (question_id,))
        question = cursor.fetchone()
        
        if not question:
            return jsonify({'error': 'Question not found'}), 404
        
        # Convert image data if present
        if question['question_image_data']:
            question['question_image_base64'] = question['question_image_data']
        del question['question_image_data']
        
        cursor.close()
        connection.close()
        
        return jsonify(question)
    
    except Error as e:
        print(f"Error fetching question: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats/<table_name>', methods=['GET'])
def get_table_stats(table_name):
    """Get statistics for a specific test bank"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Validate table name
        cursor.execute("SHOW TABLES LIKE %s", (table_name,))
        if not cursor.fetchone():
            return jsonify({'error': 'Test bank not found'}), 404
        
        # Get overall statistics
        cursor.execute(f"""
            SELECT 
                COUNT(*) as total_questions,
                SUM(CASE WHEN question_image_url IS NOT NULL OR question_image_data IS NOT NULL THEN 1 ELSE 0 END) as questions_with_images,
                SUM(CASE WHEN correct_answers LIKE '%,%' THEN 1 ELSE 0 END) as multiple_answer_questions
            FROM `{table_name}`
        """)
        
        stats = cursor.fetchone()
        
        # Get answer distribution
        cursor.execute(f"""
            SELECT correct_answers, COUNT(*) as count
            FROM `{table_name}`
            GROUP BY correct_answers
            ORDER BY count DESC
        """)
        
        answer_distribution = cursor.fetchall()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'stats': stats,
            'answer_distribution': answer_distribution
        })
    
    except Error as e:
        print(f"Error fetching stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/search/<table_name>', methods=['GET'])
def search_questions(table_name):
    """Search questions by keyword"""
    keyword = request.args.get('q', '')
    
    if not keyword:
        return jsonify({'error': 'Search query required'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Validate table name
        cursor.execute("SHOW TABLES LIKE %s", (table_name,))
        if not cursor.fetchone():
            return jsonify({'error': 'Test bank not found'}), 404
        
        query = f"""
            SELECT id, topic_name, question_text, answer_a, answer_b, answer_c, 
                   answer_d, answer_e, answer_f, correct_answers
            FROM `{table_name}`
            WHERE question_text LIKE %s 
               OR answer_a LIKE %s 
               OR answer_b LIKE %s 
               OR answer_c LIKE %s 
               OR answer_d LIKE %s
            LIMIT 50
        """
        
        search_term = f"%{keyword}%"
        cursor.execute(query, (search_term, search_term, search_term, search_term, search_term))
        results = cursor.fetchall()
        
        cursor.close()
        connection.close()
        
        return jsonify(results)
    
    except Error as e:
        print(f"Error searching questions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-stats/<table_name>', methods=['GET'])
def get_user_stats(table_name):
    """Get user statistics for a specific test bank"""
    user_id = request.args.get('user_id', 'default_user')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        query = """
            SELECT question_id, attempts, correct, last_attempt
            FROM user_stats
            WHERE user_id = %s AND table_name = %s
        """
        
        cursor.execute(query, (user_id, table_name))
        results = cursor.fetchall()
        
        # Convert to dictionary keyed by question_id
        stats = {}
        for row in results:
            stats[row['question_id']] = {
                'attempts': row['attempts'],
                'correct': row['correct'],
                'lastAttempt': row['last_attempt'].isoformat() if row['last_attempt'] else None
            }
        
        cursor.close()
        connection.close()
        
        return jsonify(stats)
    
    except Error as e:
        print(f"Error fetching user stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-stats/<table_name>/<int:question_id>', methods=['POST'])
def update_user_stats(table_name, question_id):
    """Update user statistics for a specific question"""
    user_id = request.json.get('user_id', 'default_user')
    is_correct = request.json.get('is_correct', False)
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Insert or update statistics
        query = """
            INSERT INTO user_stats (user_id, table_name, question_id, attempts, correct)
            VALUES (%s, %s, %s, 1, %s)
            ON DUPLICATE KEY UPDATE
                attempts = attempts + 1,
                correct = correct + %s,
                last_attempt = CURRENT_TIMESTAMP
        """
        
        correct_increment = 1 if is_correct else 0
        cursor.execute(query, (user_id, table_name, question_id, correct_increment, correct_increment))
        connection.commit()
        
        # Get updated stats
        cursor.execute("""
            SELECT attempts, correct, last_attempt
            FROM user_stats
            WHERE user_id = %s AND table_name = %s AND question_id = %s
        """, (user_id, table_name, question_id))
        
        result = cursor.fetchone()
        
        cursor.close()
        connection.close()
        
        if result:
            return jsonify({
                'success': True,
                'attempts': result['attempts'],
                'correct': result['correct'],
                'lastAttempt': result['last_attempt'].isoformat() if result['last_attempt'] else None
            })
        else:
            return jsonify({'error': 'Failed to update stats'}), 500
    
    except Error as e:
        print(f"Error updating user stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-stats', methods=['DELETE'])
def delete_all_user_stats():
    """Delete all user statistics (reset progress)"""
    user_id = request.args.get('user_id', 'default_user')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM user_stats WHERE user_id = %s", (user_id,))
        connection.commit()
        deleted_count = cursor.rowcount
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': f'Deleted {deleted_count} statistics records'
        })
    
    except Error as e:
        print(f"Error deleting user stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-stats/<table_name>', methods=['DELETE'])
def delete_bank_user_stats(table_name):
    """Delete user statistics for a specific test bank"""
    user_id = request.args.get('user_id', 'default_user')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute(
            "DELETE FROM user_stats WHERE user_id = %s AND table_name = %s",
            (user_id, table_name)
        )
        connection.commit()
        deleted_count = cursor.rowcount
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': f'Deleted {deleted_count} statistics records for {table_name}'
        })
    
    except Error as e:
        print(f"Error deleting bank stats: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Exam Quiz API Server...")
    print("Make sure to update DB_CONFIG with your database credentials!")
    print("Initializing user_stats table...")
    init_user_stats_table()
    app.run(debug=True, host='0.0.0.0', port=5001)