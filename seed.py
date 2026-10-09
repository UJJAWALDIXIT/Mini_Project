from app import app,db,User,Subject,Attendance,Assignment
from werkzeug.security import generate_password_hash
with app.app_context():
    u=User.query.filter_by(email="demo@studyai.local").first()
    if not u:
        u=User(name="Demo Student",email="demo@studyai.local",password_hash=generate_password_hash("demo123"),branch="CSE-AI",semester="4");db.session.add(u);db.session.commit()
        d=Subject(user_id=u.id,name="Data Structures");b=Subject(user_id=u.id,name="DBMS");m=Subject(user_id=u.id,name="Engineering Mathematics");db.session.add_all([d,b,m]);db.session.commit()
        db.session.add_all([Attendance(subject_id=d.id,attended=18,total=22),Attendance(subject_id=b.id,attended=16,total=20),Attendance(subject_id=m.id,attended=14,total=18),Assignment(user_id=u.id,subject_id=d.id,title="Linked List Assignment",deadline="Tomorrow",priority="High"),Assignment(user_id=u.id,subject_id=b.id,title="Normalization Questions",deadline="In 3 days",priority="Medium")]);db.session.commit()
    print("Demo account: demo@studyai.local / demo123")
