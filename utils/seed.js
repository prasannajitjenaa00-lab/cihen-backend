require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Lead = require('../models/Lead');
const FollowUp = require('../models/FollowUp');
const Call = require('../models/Call');
const Note = require('../models/Note');
const Timeline = require('../models/Timeline');
const Admission = require('../models/Admission');
const Student = require('../models/Student');
const Notification = require('../models/Notification');
const CRMSettings = require('../models/CRMSettings');
const MetaWebhookLog = require('../models/MetaWebhookLog');
const AuditLog = require('../models/AuditLog');

const seedData = async () => {
  try {
    const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-crm';
    console.log('Connecting to database for seeding...');
    await mongoose.connect(connString);
    console.log('Connected.');

    // Clear existing data
    console.log('Clearing existing database collections...');
    await Promise.all([
      User.deleteMany(),
      Lead.deleteMany(),
      FollowUp.deleteMany(),
      Call.deleteMany(),
      Note.deleteMany(),
      Timeline.deleteMany(),
      Admission.deleteMany(),
      Student.deleteMany(),
      Notification.deleteMany(),
      CRMSettings.deleteMany(),
      MetaWebhookLog.deleteMany(),
      AuditLog.deleteMany()
    ]);
    console.log('Collections cleared.');

    // 1. Seed Users
    console.log('Seeding staff accounts...');
    const superAdmin = await User.create({
      name: 'Super Admin User',
      email: 'superadmin@cohenschool.com',
      password: 'password123',
      role: 'Super Admin'
    });

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@cohenschool.com',
      password: 'password123',
      role: 'Admin'
    });

    const counsellor1 = await User.create({
      name: 'Rahul Kumar',
      email: 'rahul@cohenschool.com',
      password: 'password123',
      role: 'Counsellor'
    });

    const counsellor2 = await User.create({
      name: 'Priya Sharma',
      email: 'priya@cohenschool.com',
      password: 'password123',
      role: 'Counsellor'
    });

    const counsellor3 = await User.create({
      name: 'Amit Patel',
      email: 'amit@cohenschool.com',
      password: 'password123',
      role: 'Counsellor'
    });

    const admissionStaff = await User.create({
      name: 'Sarah Office',
      email: 'admissionstaff@cohenschool.com',
      password: 'password123',
      role: 'Admission Staff'
    });

    console.log('Staff accounts created.');

    // Create default CRM Settings
    console.log('Seeding initial configurations...');
    const settings = await CRMSettings.create({
      schoolName: 'Cohen International School',
      websiteApiKey: 'cohen_website_secret_api_key_2026',
      assignmentMethod: 'Round Robin'
    });

    // 2. Seed Leads (20 leads)
    console.log('Seeding leads...');
    const counsellors = [counsellor1, counsellor2, counsellor3];
    const classes = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];
    const sources = ['Facebook', 'Instagram', 'Website', 'Google', 'WhatsApp', 'Manual', 'Referral'];
    const campaigns = ['School Admission 2026', 'Secondary School Campaign', 'Digital Prospectus Promo', 'Organic Search'];

    const mockLeadsData = [
      { name: 'Aditya Dash', parent: 'Ranjan Dash', phone: '9876543201', email: 'aditya@example.com', source: 'Facebook', platform: 'facebook', campaign: 'School Admission 2026' },
      { name: 'Sonia Ray', parent: 'Pradeep Ray', phone: '9876543202', email: 'sonia@example.com', source: 'Instagram', platform: 'instagram', campaign: 'Secondary School Campaign' },
      { name: 'Sameer Sen', parent: 'Dilip Sen', phone: '9876543203', email: 'sameer@example.com', source: 'Website', platform: 'website', campaign: 'Digital Prospectus Promo' },
      { name: 'Riya Mishra', parent: 'Kamal Mishra', phone: '9876543204', email: 'riya@example.com', source: 'Google', platform: 'google', campaign: 'Organic Search' },
      { name: 'Kunal Patnaik', parent: 'Bikram Patnaik', phone: '9876543205', email: 'kunal@example.com', source: 'WhatsApp', platform: 'whatsapp', campaign: '' },
      { name: 'Abhishek Rout', parent: 'Subhas Rout', phone: '9876543206', email: 'abhishek@example.com', source: 'Manual', platform: 'manual', campaign: '' },
      { name: 'Trupti Nayak', parent: 'Niranjan Nayak', phone: '9876543207', email: 'trupti@example.com', source: 'Referral', platform: 'referral', campaign: '' },
      { name: 'Bibhu Prasad', parent: 'Debendra Prasad', phone: '9876543208', email: 'bibhu@example.com', source: 'Facebook', platform: 'facebook', campaign: 'School Admission 2026' },
      { name: 'Megha Sahu', parent: 'Gopal Sahu', phone: '9876543209', email: 'megha@example.com', source: 'Instagram', platform: 'instagram', campaign: 'Secondary School Campaign' },
      { name: 'Debashis Kar', parent: 'Arun Kar', phone: '9876543210', email: 'debashis@example.com', source: 'Website', platform: 'website', campaign: 'Digital Prospectus Promo' },
      { name: 'Ananya Jena', parent: 'Sudhir Jena', phone: '9876543211', email: 'ananya@example.com', source: 'Facebook', platform: 'facebook', campaign: 'School Admission 2026' },
      { name: 'Pratik Mohapatra', parent: 'Kishore Mohapatra', phone: '9876543212', email: 'pratik@example.com', source: 'Instagram', platform: 'instagram', campaign: 'Secondary School Campaign' },
      { name: 'Swagatika Swain', parent: 'Rabindra Swain', phone: '9876543213', email: 'swagatika@example.com', source: 'Website', platform: 'website', campaign: 'Digital Prospectus Promo' },
      { name: 'Deepak Behera', parent: 'Manohar Behera', phone: '9876543214', email: 'deepak@example.com', source: 'Facebook', platform: 'facebook', campaign: 'School Admission 2026' },
      { name: 'Soumya Panda', parent: 'Ashok Panda', phone: '9876543215', email: 'soumya@example.com', source: 'Instagram', platform: 'instagram', campaign: 'Secondary School Campaign' },
      { name: 'Bhavna Acharya', parent: 'Sanjay Acharya', phone: '9876543216', email: 'bhavna@example.com', source: 'Website', platform: 'website', campaign: 'Digital Prospectus Promo' },
      { name: 'Manish Tripathy', parent: 'Bimal Tripathy', phone: '9876543217', email: 'manish@example.com', source: 'Google', platform: 'google', campaign: 'Organic Search' },
      { name: 'Kirti Mohanty', parent: 'Prasanta Mohanty', phone: '9876543218', email: 'kirti@example.com', source: 'WhatsApp', platform: 'whatsapp', campaign: '' },
      { name: 'Nikhil Das', parent: 'Ajit Das', phone: '9876543219', email: 'nikhil@example.com', source: 'Manual', platform: 'manual', campaign: '' },
      { name: 'Subham Ghosh', parent: 'Kartik Ghosh', phone: '9876543220', email: 'subham@example.com', source: 'Referral', platform: 'referral', campaign: '' }
    ];

    const leads = [];
    const statuses = ['New', 'Contacted', 'Interested', 'Follow-up', 'Visit Scheduled', 'Application Started', 'Application Submitted', 'Admission Confirmed', 'Not Interested', 'Lost'];
    const priorities = ['Low', 'Medium', 'High', 'Urgent'];

    for (let i = 0; i < mockLeadsData.length; i++) {
      const data = mockLeadsData[i];
      const assignedCounsellor = counsellors[i % counsellors.length];

      // Distribute statuses realistically
      let status = 'New';
      if (i >= 4 && i < 8) status = 'Contacted';
      else if (i >= 8 && i < 11) status = 'Interested';
      else if (i >= 11 && i < 13) status = 'Follow-up';
      else if (i >= 13 && i < 15) status = 'Visit Scheduled';
      else if (i === 15) status = 'Application Started';
      else if (i === 16) status = 'Application Submitted';
      else if (i >= 17) status = 'Admission Confirmed';

      const lead = await Lead.create({
        studentName: data.name,
        parentName: data.parent,
        phone: data.phone,
        email: data.email,
        classInterested: classes[i % classes.length],
        academicYear: '2026-2027',
        leadSource: data.source,
        platform: data.platform,
        campaign: data.campaign,
        assignedCounsellor: assignedCounsellor._id,
        status: status,
        priority: priorities[i % priorities.length],
        nextFollowUp: status === 'Follow-up' ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) : null,
        lastContactDate: status !== 'New' ? new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) : null
      });

      leads.push(lead);

      // Create timeline entry
      await Timeline.create({
        lead: lead._id,
        eventType: 'Created',
        message: `Lead ingested from ${lead.leadSource} source`,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      });

      if (status !== 'New') {
        await Timeline.create({
          lead: lead._id,
          eventType: 'Assigned',
          message: `Lead assigned to ${assignedCounsellor.name}`,
          createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
        });
        await Timeline.create({
          lead: lead._id,
          eventType: 'StatusChange',
          message: `Status updated to ${status}`,
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        });
      }
    }

    console.log(`${leads.length} leads created.`);

    // 3. Seed Follow-ups (10 follow-ups)
    console.log('Seeding follow-ups...');
    const followUpTypes = ['Call', 'WhatsApp', 'SMS', 'School Visit', 'Meeting'];
    const followUps = [];

    // Filter leads on 'Follow-up' status or others
    const followLeads = leads.filter(l => ['Follow-up', 'Visit Scheduled', 'Interested'].includes(l.status));

    for (let i = 0; i < 10 && i < followLeads.length; i++) {
      const lead = followLeads[i];
      const isToday = i < 3;
      const isOverdue = i >= 3 && i < 6;
      let date = new Date();

      if (isToday) {
        // Today
        date.setHours(10 + i, 30, 0, 0);
      } else if (isOverdue) {
        // Overdue (Yesterday)
        date.setDate(date.getDate() - 1);
        date.setHours(11, 0, 0, 0);
      } else {
        // Future
        date.setDate(date.getDate() + 3);
        date.setHours(14, 0, 0, 0);
      }

      const followUp = await FollowUp.create({
        lead: lead._id,
        counsellor: lead.assignedCounsellor,
        date: date,
        time: `${10 + i}:30`,
        type: followUpTypes[i % followUpTypes.length],
        notes: `Follow-up to check document collection and school visit interest.`,
        status: isOverdue ? 'Pending' : (i % 2 === 0 ? 'Pending' : 'Completed')
      });

      followUps.push(followUp);
    }
    console.log(`${followUps.length} follow-ups created.`);

    // 4. Seed Admissions (5 applications)
    console.log('Seeding admission applications...');
    const appLeads = leads.filter(l => ['Application Started', 'Application Submitted', 'Admission Confirmed'].includes(l.status));
    const appStatuses = ['Application Started', 'Application Submitted', 'Documents Pending', 'Verification', 'Approved', 'Admission Confirmed'];
    const admissions = [];

    for (let i = 0; i < 5 && i < appLeads.length; i++) {
      const lead = appLeads[i];
      const status = lead.status === 'Admission Confirmed' ? 'Admission Confirmed' : appStatuses[i % appStatuses.length];

      const admission = await Admission.create({
        applicationNumber: `APP-2026-100${i + 1}`,
        lead: lead._id,
        studentName: lead.studentName,
        parentName: lead.parentName,
        classInterested: lead.classInterested,
        academicYear: lead.academicYear,
        counsellor: lead.assignedCounsellor,
        status: status,
        paymentStatus: status === 'Admission Confirmed' ? 'Paid' : 'Pending',
        documents: [
          { name: 'Birth Certificate', fileUrl: 'https://example.com/docs/birth.pdf', fileType: 'PDF' },
          { name: 'Previous School Marksheet', fileUrl: 'https://example.com/docs/marksheet.pdf', fileType: 'PDF' }
        ]
      });

      admissions.push(admission);

      await Timeline.create({
        lead: lead._id,
        eventType: 'StatusChange',
        message: `Admission status updated to ${status}`,
        createdAt: new Date()
      });
    }
    console.log(`${admissions.length} admission applications created.`);

    // 5. Seed Students (5 students)
    console.log('Seeding student profiles...');
    const confirmedApps = admissions.filter(a => a.status === 'Admission Confirmed');
    const students = [];

    // Let's also enforce that any lead with "Admission Confirmed" status has a Student profile
    const confirmedLeads = leads.filter(l => l.status === 'Admission Confirmed');

    for (let i = 0; i < confirmedLeads.length; i++) {
      const lead = confirmedLeads[i];
      const app = confirmedApps[i] || { applicationNumber: `APP-2026-200${i + 1}` };

      const student = await Student.create({
        studentId: `STU-2026-100${i + 1}`,
        admissionNumber: `ADM-2026-100${i + 1}`,
        studentName: lead.studentName,
        parentName: lead.parentName,
        phone: lead.phone,
        email: lead.email,
        dob: new Date('2014-05-15'),
        gender: i % 2 === 0 ? 'Male' : 'Female',
        address: 'Plot 45, Forest Park, Bhubaneswar, Odisha',
        class: lead.classInterested,
        section: 'A',
        academicYear: lead.academicYear,
        admissionDate: new Date(),
        status: 'Active'
      });

      students.push(student);
    }
    console.log(`${students.length} student records created.`);

    // Log seed completion
    await AuditLog.create({
      user: superAdmin._id,
      action: 'Seeding',
      entity: 'System',
      entityId: 'SeedingScript',
      details: 'Database seeded with demo dataset.'
    });

    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Database seeding failed:', error.message);
    process.exit(1);
  }
};

seedData();
