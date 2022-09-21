function Roles(Manager) {
  const self = this;
  
  self.Manager = Manager;
}

Roles.prototype.list = function () {
  const self = this;

  return [
    // Staff
    {
      id: 'staff',
      name: 'Staff',
      regex: /(^staff$)/ig,
    },    
    {
      id: 'admin',
      name: 'Administrator',
      regex: /(^administrator$|^admin$)/ig,
    },
    {
      id: 'moderator',
      name: 'Moderator',
      regex: /(^moderator$|^mod$)/ig,
    },
    {
      id: 'moderatorJr',
      name: 'Jr. Moderator',
      regex: /(^moderatorjr$|^modjr$)/ig,
    },    
    {
      id: 'blogger',
      name: 'Blogger',
      regex: /(^blogger$|^blog$)/ig,
    },
    {
      id: 'developer',
      name: 'Developer',
      regex: /(^developer$|^dev$)/ig,
    },

    // Features
    {
      id: 'betaTester',
      name: 'Beta Tester',
      regex: /(^betatester$|^beta$)/ig,
    },    

    // Vanity
    {
      id: 'og',
      name: 'OG',
      regex: /(^og$)/ig,
    },
    {
      id: 'vip',
      name: 'VIP',
      regex: /(^vip)/ig,
    },    
  ]
};

module.exports = Roles;
