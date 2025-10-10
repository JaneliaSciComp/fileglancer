
import json
from datetime import datetime

from loguru import logger
from atlassian import Jira

from fileglancer_central.settings import get_settings

settings = get_settings()
DEBUG = False

def get_jira_client() -> Jira:
    jira_server = str(settings.atlassian_url)
    jira_username = settings.atlassian_username
    jira_token = settings.atlassian_token

    if not all([jira_server, jira_token]):
        raise ValueError("Missing required JIRA credentials in environment variables")
    
    return Jira(url=jira_server, username=jira_username, password=jira_token, cloud=True)


def create_jira_ticket(summary: str, description: str, project_key: str, issue_type: str) -> str:
    """
    Creates a new JIRA ticket using the Atlassian Python API
    
    Args:
        summary (str): Title/summary of the ticket
        description (str): Detailed description of the ticket
        project_key (str): The project key where ticket should be created (e.g. 'PROJ')
        issue_type (str): Type of issue (e.g. 'Task', 'Bug', 'Story')
        
    Returns:
        str: The key of the created issue (e.g. 'PROJ-123')
    """
    jira = get_jira_client()
    
    # Prepare issue fields
    issue_dict = {
        'project': {'key': project_key},
        'summary': summary,
        'description': description,
        'issuetype': {'name': issue_type},
    }
    
    # Create the issue
    new_issue = jira.issue_create(fields=issue_dict)
    logger.debug(f"JIRA ticket created: {new_issue['key']}")
    return new_issue


def parse_datetime(datetime_str: str) -> datetime:
    """
    Parse an ISO timestamp string from JIRA
    """
    return datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))


def get_jira_ticket_details(ticket_key: str) -> dict:
    """
    Get the status of a JIRA ticket
    
    Args:
        ticket_key (str): The key of the ticket to get status for
        
    Returns:
        str: The status of the ticket
    """
    jira = get_jira_client()
    issue = jira.issue(ticket_key)['fields']
    
    if DEBUG:
        print(json.dumps(issue, indent=4))

    created = parse_datetime(issue['created']) if 'created' in issue else None
    updated = parse_datetime(issue['updated']) if 'updated' in issue else None
    status = issue.get('status', {}).get('name', 'Unknown')
    resolution = issue.get('resolution', {}).get('name', 'Unresolved') if issue.get('resolution') else "Unresolved"
    description = issue.get('description', '')

    issue_details = {
        'key': ticket_key,
        'created': created,
        'updated': updated,
        'status': status, # E.g. "Waiting for support", "In Progress", "Resolved"
        'resolution': resolution, # E.g. "Unresolved", "Fixed"
        'description': description,
        'link': f"{settings.jira_browse_url}/{ticket_key}",
        'comments': []
    }

    # Safely handle comments
    comments_data = issue.get('comment', {}).get('comments', [])
    for c in comments_data:
        try:
            comment = {
                'author_name': c.get('author', {}).get('name', 'Unknown'),
                'author_display_name': c.get('author', {}).get('displayName', 'Unknown'),
                'body': c.get('body', ''),
                'created': parse_datetime(c['created']) if 'created' in c else None,
                'updated': parse_datetime(c['updated']) if 'updated' in c else None
            }
            issue_details['comments'].append(comment)
        except Exception as e:
            logger.warning(f"Error parsing comment for ticket {ticket_key}: {e}")
            continue

    logger.debug(f"Retrieved details for ticket {ticket_key}: status '{status}', resolution '{resolution}'")
    return issue_details
    

def delete_jira_ticket(ticket_key: str):
    """
    Delete a JIRA ticket
    
    Args:
        ticket_key (str): The key of the ticket to delete
    """
    jira = get_jira_client()
    jira.delete_issue(ticket_key)
    logger.debug(f"JIRA ticket deleted: {ticket_key}")



if __name__ == "__main__":
    # Example usage
    try:
        ticket = create_jira_ticket(
            project_key="FT",
            issue_type="Service Request",
            summary="Test Ticket",
            description="This is a test ticket created via API *bold*\nnew line"
        )
        ticket_details = get_jira_ticket_details(ticket['key'])
        delete_jira_ticket(ticket['key'])

        #delete_jira_ticket('2') # requests.exceptions.HTTPError: Issue Does Not Exist

    except Exception as e:
        print("Full stack trace:")
        import traceback
        traceback.print_exc()
