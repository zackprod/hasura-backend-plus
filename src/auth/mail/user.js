const fetch = require("node-fetch");
const axios = require("axios");

const {
  HASURA_GRAPHQL_ENDPOINT,
  HASURA_GRAPHQL_ADMIN_SECRET,
  access_token_expires_mail
} = require("../../config");

module.exports = class user {
  static staticgetcurrentdate() {
    let i = access_token_expires_mail;
    var date = new Date();

    return new Date(date.getTime() + i * 60000);
  }

  static async getSecretToken(id) {
    let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
      },
      body: JSON.stringify({
        query: `  query MyQuery($id:uuid) {
          users(where: {id: {_eq: $id}}) {
            secret_token
          }
        }
        
      
          
          `,
        variables: {
          id: id
        }
      })
    });
    const data = await response.json();
    if (data.data.users.length > 0) {
      return data.data.users[0].secret_token;
    } else {
      return null;
    }
  }
  static async updateSecretTokenExpires(email) {
    let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
      },
      body: JSON.stringify({
        query: `  mutation MyMutation($email:String,$date:timestamptz) {
          __typename
          update_users(where: {email: {_eq: $email}}, _set: {secret_token_expires_at: $date}) {
            affected_rows
            returning {
              id
            }
          }
        }
      
          
          `,
        variables: {
          email: email,
          date: this.staticgetcurrentdate()
        }
      })
    });

    const data = await response.json();
    if (data.data.update_users.returning.length > 0) {
      return data.data.update_users.returning[0].id;
    } else {
      return null;
    }
  }

  static async getStatusUser(email) {
    let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
      },
      body: JSON.stringify({
        query: ` query MyQuery {
          users(where: {email: {_eq: "${email}"}}, limit: 1) {
            active
          }
        }
        
          
          `
      })
    });

    var data = await response.json();

    if (data.data.users.length > 0) {
      return data.data.users[0].active;
    } else {
      return -1;
    }
  }

  static async activateAccount(id) {
    try {
      let secret_token = await this.getSecretToken(id);
      if (secret_token != null) {
        var data = await axios.post(
          `https://auth.skiliks.net/auth/activate-account`,
          {
            secret_token: secret_token
          }
        );
        console.log(data.data);
        if (data.data.statusCode) return null;
        return data;
      } else {
        return null;
      }
    } catch (error) {
      console.log(error);

      return null;
    }
  }

  static async insertCode_token_forgot_psw(email, uuid) {
    try {
      let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
        },
        body: JSON.stringify({
          query: ` mutation MyMutation($email:String,$date:timestamptz,$uuid:String) {
            __typename
            update_users(where: {email: {_eq: $email}}, _set: {code_token_forgot_psw:$uuid, code_token_forgot_psw_expires_at:$date}) {
              affected_rows
            }
          }   
          `,
          variables: {
            email: email,
            date: this.staticgetcurrentdate(),
            uuid: uuid
          }
        })
      });
      const data = await response.json();
      if (data.data.update_users && data.data.update_users.affected_rows == 1) {
        return 1;
      } else {
        return 0;
      }
    } catch (error) {
      console.log(error);
      return 0;
    }
  }

  static async update_secret_token_forgot_psw(email, uuid) {
    try {
      let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
        },
        body: JSON.stringify({
          query: `mutation MyMutation($email: String, $uuid: String, $date: timestamptz) {
            __typename
            update_users(where: {email: {_eq: $email}, code_token_forgot_psw: {_eq: $uuid}, code_token_forgot_psw_expires_at: {_gt: "now()"}}, _set: {secret_token_expires_at: $date}) {
              affected_rows
              returning {
                secret_token
              }
            }
          }
          
            
          `,
          variables: {
            email: email,
            date: this.staticgetcurrentdate(),
            uuid: uuid
          }
        })
      });
      const data = await response.json();

      if (data.data.update_users && data.data.update_users.affected_rows == 1) {
        return data.data.update_users.returning[0].secret_token;
      } else {
        return 0;
      }
    } catch (error) {
      console.log(error);
      return 0;
    }
  }
};
