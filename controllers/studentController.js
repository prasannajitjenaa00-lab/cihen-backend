const Student = require('../models/Student');

// @desc    Get all student records
// @route   GET /api/students
// @access  Private
exports.getStudents = async (req, res) => {
  try {
    let query = {};
    const { search, classInterested } = req.query;

    if (classInterested) {
      query.class = classInterested;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { studentName: searchRegex },
        { parentName: searchRegex },
        { studentId: searchRegex },
        { admissionNumber: searchRegex },
        { phone: searchRegex }
      ];
    }

    const students = await Student.find(query).sort({ admissionDate: -1 });

    res.status(200).json({ success: true, count: students.length, data: students });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
