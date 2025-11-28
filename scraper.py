from requests_html import HTMLSession
from bs4 import BeautifulSoup
import mysql.connector
import time
import re
import base64
import requests
from urllib.parse import urljoin

def sanitize_table_name(topic_name):
    """Convert topic name to a valid SQL table name"""
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', topic_name)
    sanitized = re.sub(r'_+', '_', sanitized)
    sanitized = sanitized.strip('_')
    if sanitized and not sanitized[0].isalpha():
        sanitized = 'tbl_' + sanitized
    sanitized = sanitized[:64]
    return sanitized.lower()

def create_topic_table(cursor, table_name):
    """Create a new table for a specific topic"""
    create_table_sql = f"""
    CREATE TABLE IF NOT EXISTS `{table_name}` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        topic_name VARCHAR(255) NOT NULL,
        question_text TEXT NOT NULL,
        question_image_url VARCHAR(500),
        question_image_data LONGTEXT,
        question_image_type VARCHAR(50),
        answer_a TEXT,
        answer_b TEXT,
        answer_c TEXT,
        answer_d TEXT,
        answer_e TEXT,
        answer_f TEXT,
        correct_answers VARCHAR(20) NOT NULL,
        page_number INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_page_number (page_number),
        INDEX idx_topic_name (topic_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    cursor.execute(create_table_sql)
    print(f"✓ Table '{table_name}' created/verified")

def download_and_encode_image(image_url, base_url):
    """Download an image and return base64 encoded data with MIME type"""
    try:
        # Make the URL absolute if it's relative
        full_url = urljoin(base_url, image_url)
        
        print(f"    Downloading image: {full_url}")
        response = requests.get(full_url, timeout=10)
        response.raise_for_status()
        
        # Get content type
        content_type = response.headers.get('content-type', 'image/png')
        
        # Encode to base64
        image_data = base64.b64encode(response.content).decode('utf-8')
        
        return image_data, content_type, full_url
    except Exception as e:
        print(f"    Error downloading image: {str(e)}")
        return None, None, image_url

def scrape_exam_questions(base_url, topic_name, start_page, end_page, db_config, download_images=True):
    """
    Scrape exam questions from a URL pattern
    
    Args:
        base_url: Base URL pattern with {page} placeholder
        topic_name: Name of the topic/exam (e.g., "AWS SAA-C03")
        start_page: Starting page number
        end_page: Ending page number (inclusive)
        db_config: Dictionary with database connection parameters
        download_images: If True, downloads and stores images; if False, only stores URLs
    """
    
    # Database connection
    db = mysql.connector.connect(**db_config)
    cursor = db.cursor()
    
    # Create table name from topic
    table_name = sanitize_table_name(topic_name)
    
    # Create the table
    create_topic_table(cursor, table_name)
    
    session = HTMLSession()
    
    # Loop through pages
    for page_num in range(start_page, end_page + 1):
        URL = base_url.format(page=page_num)
        
        print(f"\n{'='*60}")
        print(f"SCRAPING PAGE {page_num} - Topic: {topic_name}")
        print(f"{'='*60}\n")
        
        try:
            page = session.get(URL)
            soup = BeautifulSoup(page.content, "html.parser")
            
            questions = soup.find_all("p", class_="lead")
            
            for question in questions:
                # Initialize image variables
                image_url = None
                image_data = None
                image_type = None
                
                # Look for images in the question (before the first div)
                for content in question.children:
                    if content.name == 'div':
                        break
                    if content.name == 'img':
                        image_url = content.get("src")
                        if image_url:
                            print(f"  📷 Image found in question!")
                            if download_images:
                                image_data, image_type, image_url = download_and_encode_image(image_url, URL)
                        break
                
                # Get all text nodes before the first <div> tag
                question_parts = []
                for content in question.children:
                    if content.name == 'div':
                        break  # Stop when we hit the first div
                    if content.name == 'br':
                        question_parts.append(' ')
                    elif content.name == 'img':
                        # Skip images in text extraction
                        continue
                    elif isinstance(content, str):
                        question_parts.append(content.strip())
                    else:
                        question_parts.append(content.get_text().strip())
                
                question_text = ' '.join(question_parts).strip()
                
                # Initialize answer dictionary
                answers_dict = {
                    'answer_a': None,
                    'answer_b': None,
                    'answer_c': None,
                    'answer_d': None,
                    'answer_e': None,
                    'answer_f': None
                }
                correct_answers = []  # List to store multiple correct answers
                
                # Find all answer options
                answer_list = question.find("ol", class_="rounded-list")
                if answer_list:
                    all_lis = answer_list.find_all("li")
                    answer_labels = ['A', 'B', 'C', 'D', 'E', 'F']
                    
                    answer_idx = 0
                    for li in all_lis:
                        if answer_idx >= len(answer_labels):
                            break
                        
                        # Get only the direct text of this <li>
                        answer_text = ""
                        for content in li.children:
                            if isinstance(content, str):
                                answer_text += content.strip()
                            elif content.name != 'li':
                                answer_text += content.get_text().strip()
                        
                        answer_text = answer_text.strip()
                        
                        # Skip empty answers
                        if not answer_text:
                            continue
                        
                        is_correct = li.get("data-correct") == "True"
                        answer_label = answer_labels[answer_idx]
                        
                        # Store answer in dictionary
                        column_name = f'answer_{answer_label.lower()}'
                        answers_dict[column_name] = answer_text
                        
                        if is_correct:
                            correct_answers.append(answer_label)
                        
                        print(f"  {answer_label}. {answer_text[:80]}{'...' if len(answer_text) > 80 else ''} {'✓ CORRECT' if is_correct else ''}")
                        
                        answer_idx += 1
                
                if correct_answers:
                    # Join multiple correct answers with comma (e.g., "A,C,D")
                    correct_answers_str = ','.join(sorted(correct_answers))
                    
                    # Insert question into database
                    insert_sql = f"""
                        INSERT INTO `{table_name}` 
                        (topic_name, question_text, question_image_url, question_image_data, question_image_type,
                         answer_a, answer_b, answer_c, answer_d, answer_e, answer_f, correct_answers, page_number) 
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    cursor.execute(insert_sql, (
                        topic_name,
                        question_text,
                        image_url,
                        image_data,
                        image_type,
                        answers_dict['answer_a'],
                        answers_dict['answer_b'],
                        answers_dict['answer_c'],
                        answers_dict['answer_d'],
                        answers_dict['answer_e'],
                        answers_dict['answer_f'],
                        correct_answers_str,
                        page_num
                    ))
                    
                    print(f"\nQuestion: {question_text[:100]}{'...' if len(question_text) > 100 else ''}")
                    if image_url:
                        print(f"Image: {'✓ Downloaded and stored' if image_data else '✓ URL stored'}")
                    print(f"Correct Answer(s): {correct_answers_str}")
                    if len(correct_answers) > 1:
                        print(f"  ⚠️  Multiple correct answers detected! ({len(correct_answers)} answers)")
                    print("="*40 + "\n")
                    
                    db.commit()
                else:
                    print(f"WARNING: No correct answer found for question on page {page_num}\n")
            
            # Be polite to the server
            time.sleep(1)
            
        except Exception as e:
            print(f"Error on page {page_num}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue
    
    # Close database connection
    cursor.close()
    db.close()
    
    print(f"\n✓ Scraping complete for {topic_name}! Data saved to table '{table_name}'.")

# Database configuration
db_config = {
    "host": "localhost",
    "user": "exam_user",
    "password": "your_secure_password_here",
    "database": "exam_questions"
}

"""# Scrape different exam question sets
scrape_exam_questions(
    base_url="https://free-braindumps.com/amazon/free-saa-c03-braindumps/page-{page}",
    topic_name="AWS SAA-C03",
    start_page=2,
    end_page=152,
    db_config=db_config
)

time.sleep(10)  # Short pause between different scrapes
scrape_exam_questions(
    base_url="https://free-braindumps.com/microsoft/free-az-104-braindumps/page-{page}",
    topic_name="Azure AZ-104",
    start_page=2,
    end_page=40,
    db_config=db_config
)

time.sleep(10)
scrape_exam_questions(
    base_url="https://free-braindumps.com/microsoft/free-az-900-braindumps/page-{page}",
    topic_name="Azure AZ-900",
    start_page=2,
    end_page=35,
    db_config=db_config
)

time.sleep(10)
scrape_exam_questions(
    base_url="https://free-braindumps.com/google/free-google-cloud-architect-professional-braindumps/page-{page}",
    topic_name="Google Cloud Architect Professional",
    start_page=2,
    end_page=41,
    db_config=db_config
)

time.sleep(10)
scrape_exam_questions(
    base_url="https://free-braindumps.com/google/free-professional-cloud-devops-engineer-braindumps/page-{page}",
    topic_name="Google Cloud DevOps Engineer Professional",
    start_page=2,
    end_page=26,
    db_config=db_config
)
"""
time.sleep(10)
scrape_exam_questions(
    base_url="https://free-braindumps.com/hashicorp/free-terraform-associate-braindumps/page-{page}",
    topic_name="Hashicorp Terraform Associate",
    start_page=2,
    end_page=51,
    db_config=db_config
)