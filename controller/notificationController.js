import Notification from "../model/notification.js";
import Opportunity from "../model/opportunity.js";

export const applyOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);

    // add applicant
    opp.applicants.push(req.user.id);
    await opp.save();

    // SEND NOTIFICATION TO NGO
    await Notification.create({
      to: opp.createdBy, // NGO id
      from: req.user.id,
      opportunity: opp._id,
      type: "apply",
      message: "New volunteer applied to your opportunity"
    });

    res.json({ msg: "Applied successfully" });

  } catch (err) {
    res.status(500).json({ msg: "Error" });
  }
};

export const respondApplication = async (req, res) => {
  try {
    const { volunteerId, status } = req.body; // accept / reject

    // SEND NOTIFICATION BACK TO VOLUNTEER
    await Notification.create({
      to: volunteerId,
      from: req.user.id,
      opportunity: req.params.id,
      type: status,
      message: `Your application was ${status}`
    });

    res.json({ msg: `Application ${status}` });

  } catch (err) {
    res.status(500).json({ msg: "Error" });
  }
};